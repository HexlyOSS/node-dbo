# Node Database Object for Postgres


Easiest usage is to isolate all instances to a single DBO in `dbo.js` or something:
```js
const path = require('path')
const { Pool } = require('pg')
const { DboFactory, Configurer } = require('@hexly/dbo')

let dbo
const initDbo = async () => {
  if (dbo) {
    return dbo
  }

  const pool = new Pool({
    connectionString: 'postgres://postgres@localhost:5432/postgres'
  })

  new Configurer().configure()
  const root = path.resolve(__dirname, './src')
  const factory = new DboFactory().scan(root)

  dbo = factory.build(pool.connect.bind(pool))
  return dbo
}

module.exports = {
  initDbo
}
```


And then have your middleware/etc wire it up:
```js

var express = require('express')
const { initDbo } = require('./dbo')

var app = express()
app.use( async(req, res, next) => {
  const dbo = await initDbo()
  req.dbo = dbo
  next()
})

app.get('/', async (req, res) => {
  const person = await req.dbo.getPeople.one({ids: [1]})
  const people = await req.dbo.getPeople.many({})
  res.send({ person, people })
})

const port = process.env.PORT || 3000
app.listen(port, (a, b, c) => {
  console.log('listening on', port)
})


```