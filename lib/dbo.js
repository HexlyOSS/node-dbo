const SafeSQL = require('pg-sql2')
const yesql = require('yesql').pg
const R = require('ramda')
const glob = require('glob')
const { Pool, types, Query } = require('pg')
const camelize = require('camelize')

// const pool = new Pool({
//   connectionString: config.databaseUrl
// })

class Configurer {
  parser() {
    return val => {
      if (val == null) {
        return val
      }
      const json = val == null ? val : JSON.parse(val)
      return camelize(json)
    }
  }

  configure() {
    this.configureTypes()
    this.configureQuery()
    return this
  }

  // Hijack the type-parsers to parse sane data-types from pg
  configureTypes() {
    // configure BIGDECIMAL and BIGINT to be numbers, not strings
    types.setTypeParser(20, val => parseInt(val))
    types.setTypeParser(701, val => parseInt(val))

    // JSON / JSON[]
    types.setTypeParser(114, this.parser(114))
    types.setTypeParser(119, this.parser(119))

    // JSONB / JSONB[]
    types.setTypeParser(3802, this.parser(3802))
    types.setTypeParser(3807, this.parser(3807))
    return this
  }

  // hijack the Query to camelize each column
  configureQuery() {
    const queryProto = Query.prototype
    const handleRowDesc = queryProto.handleRowDescription

    queryProto.handleRowDescription = function(msg) {
      msg.fields.forEach(field => {
        field.name = camelize(field.name)
      })
      return handleRowDesc.call(this, msg)
    }
    return this
  }
}

class DboFactory {
  constructor() {
    this.templates = {}
    this.factories = {}
  }

  scan(base, pattern = '**/*.sql.js') {
    const files = glob.sync(`${base}/${pattern}`)

    files.forEach(file => {
      const name = file
        .split('.sql')[0]
        .split('/')
        .slice(-1)
      this.templates[name] = require(file)
    })
    this.configureFactories()
    return this
  }

  configureFactories() {
    Object.keys(this.templates).forEach(name => {
      const factory = cp => {
        const domain = {}
        Object.keys(this.templates[name]).forEach(qName => {
          const sql = this.templates[name][qName]
          const root = async params => {
            const conn = await cp()
            try {
              return conn.query(yesql(sql)(params))
            } finally {
              if (!conn.__tx) {
                conn.release()
              }
            }
          }
          root.one = async (params = {}) =>
            R.path(['rows', 0], await root(params))
          root.many = async (params = {}) =>
            R.pathOr([], ['rows'], await root(params))
          root.sql = sql
          domain[qName] = root
        })
        return domain
      }
      this.factories[name] = factory
    })
    return this
  }

  build(cp) {
    const dbo = {}
    Object.keys(this.factories).forEach(name => {
      dbo[name] = this.factories[name](cp)
    })

    // if the user provided a clone domain, hold on to it
    let cloneDomain
    if (dbo.clone) {
      console.warn(
        '[dbo:factory] Detected domain of clone; hijacking root domain to support cloning'
      )
      cloneDomain = dbo.clone
    }

    dbo.clone = newCp => this.build(newCp)

    if (cloneDomain) {
      Object.assign(dbo.clone, cloneDomain)
    }

    // TODO clean this up
    dbo.transaction = async callback => {
      const conn = await cp()
      conn.__tx = true
      try {
        let rolledBack = false
        const tx = {
          savepoint: async label => await conn.query(`SAVEPOINT ${label}`),
          rollback: async label => {
            if (label) {
              await conn.query(`ROLLBACK TO SAVEPOINT ${label}`)
            } else {
              await conn.query(`ROLLBACK`)
              rolledBack = true
            }
          }
        }
        await conn.query('BEGIN')
        let result = await callback(dbo.clone(() => conn), tx)
        if (!rolledBack) {
          await conn.query('COMMIT')
        }

        return result
      } catch (err) {
        await conn.query('ROLLBACK')
        throw err
      } finally {
        await conn.release(true)
      }
    }

    return dbo
  }
}

module.exports = {
  DboFactory,
  Configurer
}
