const path = require('path')
const { Pool } = require('pg')

const { DboFactory, Configurer } = require('../lib/dbo')

let pool, factory
beforeAll(async () => {
  pool = new Pool({
    connectionString: 'postgres://dbadmin:changeme@localhost:5400/system'
  })

  new Configurer().configure()
  const root = path.resolve(__dirname, './')
  factory = new DboFactory().scan(root)
})

// test('simple', async () => {
//   const dbo = factory.build(pool.connect.bind(pool))
//   const tenants = await dbo.platform.tenants.many()
//   console.log({ tenants })

//   const members = await dbo.members.page.many({
//     page: 1,
//     pageSize: 25
//   })
//   console.log({ members })
// })

test('transaction', async () => {
  const dbo = factory.build(pool.connect.bind(pool))
  let s1, s2, s3, created

  const attempted = {
    id: 9999,
    name: 'foo',
    slug: 'foo'
  }

  const expected = new Error('Planned failure ')
  try {
    await dbo.transaction(async dbo2 => {
      let tenants = await dbo2.platform.tenants.many()
      s1 = tenants.length

      rolledBack = await dbo2.platform.insert.one(attempted)

      const tenants2 = await dbo2.platform.tenants.many()
      s2 = tenants2.length

      throw expected
    })
  } catch (err) {
    if (err !== expected) throw err
  }

  const tenants = await dbo.platform.tenants.many()
  expect(tenants.length).toEqual(s1)
  expect(tenants.length).toEqual(s2 - 1)
  expect(attempted).toEqual(rolledBack)
})
