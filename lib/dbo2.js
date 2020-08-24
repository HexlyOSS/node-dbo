
const _ = require('lodash')
const path = require('path')
const glob = require('glob')
const YeSQL = require('yesql')
const pgPromise = require('pg-promise')
const camelize = require('camelize')

class DboError extends Error {
  constructor(message, cause, path, operation, trace) {
    super(message)
    const op = operation ? '.' + operation : ''
    this.name = `DboError[${path}${op}]`
    // this.name = this.constructor.name
    this.path = path
    this.operation = operation
    this.trace = trace
    if( trace.stack ){
      this.stack = trace.stack
    }

    if( process.env.DBO_INCLUDE_CAUSE ){
      this.cause = cause
    }
  }
}

const defaultConverter = ({ yesql, dbo } ) => (query, path) => {
  // strips comments
  const parsedQuery = query.replace(/--[^\n]*$/gm, '').replace(/\/\*[^\*\/]*\*\//gm, '')
  const prepared = yesql(parsedQuery)

  const onError = (trace, operation) => cause => {
    throw new DboError(cause.message, cause, path, operation, trace.stack, trace)
  }

  const root = async (parameters) => {
    const trace = {}
    Error.captureStackTrace(trace)
    const { text: sql, values: params } = prepared(parameters)
    Object.assign(trace, { sql, params, query, parsedQuery })
    return dbo.task(path, t => t.query(sql, params)).catch(onError(trace))
  }

  ['one', 'many', 'any', 'none', 'manyOrNone'].forEach( operation => {
    root[operation] = (parameters) => {
      const trace = {}
      Error.captureStackTrace(trace)
      const { text: sql, values: params } = prepared(parameters)
      Object.assign(trace, { sql, params, query, parsedQuery })
      return dbo.task(path, t => t[operation](sql, params)).catch(onError(trace, operation))
    }
  })


  return root
}

const recurseMap = (target, converter, path = '') =>{
  const type = typeof target
  switch (type){
    case 'string':
      return converter(target, path)
    case 'object':
      const obj = _.cloneDeep(target)
      Object.keys(target)
        .map( async k => {
          obj[k] = recurseMap(target[k], converter, path ? `${path}.${k}` : k)
        })
      return obj
    default:
      console.log('ignoring type', type, path)
  }
}

const templateFiles = (path) => {
  const templates =
    glob.sync(path)
      .reduce( (carry, file) => {
        const name = file
          .split('.sql')[0]
          .split('/')
          .slice(-1)
        carry[name] = require(file)
        return carry
      }, {})
  return templates
}

function camelizeColumns(data, pgp) {
  const tmp = data[0];
  for (const prop in tmp) {
    const camel = camelize(prop) //pgp.utils.camelize(prop);
    for (let i = 0; i < data.length; i++) {
      const d = data[i];
      d[camel] = typeof(d[prop]) === 'object' ? camelize(d[prop]) : d[prop];
      if (camel !== prop) {
        delete d[prop];
      }
    }
  }
}

const initDbo = async (cfg={}) => {
  const config = {
    pattern: '**/*.sql.js',
    ...cfg,
    sqlPath: path.resolve(cfg.sqlPath)
  }

  const yc = {
    useNullForMissing: true,
    ...(config.yesql || {})
  }


  const yesql = (sql) => YeSQL.pg(sql, yc)
  const templates = await templateFiles(`${config.sqlPath}/${config.pattern}`)

  let pgp
  config.pgConfig = {
    ...(cfg.pgPromise || {}),
    receive(e){
      camelizeColumns(e, pgp)
    },
    extend(obj, dc){
      const converter = defaultConverter({ yesql, dbo: obj, pgp })
      const compiled = recurseMap(templates, converter)
      Object.assign(obj, compiled)
      if( cfg.pgPromise && cfg.pgPromise.extend){
        cfg.pgPromise.extend(obj, dc) // call client code handler
      }
      obj._config = {
        yesql,
        config,
        templates
      }
      obj.compile = sql => converter(sql, '<dbo.run>')
    }
  }

  pgp = pgPromise(config.pgConfig)
  const db = pgp(config.url)
  return db
}

module.exports = {
  initDbo
}