const { DboFactory, Configurer } = require('./lib/dbo')
const v2 = require('./lib/dbo2')

const root = {
  DboFactory, Configurer,
  v2
}

module.exports = {
  ...root,
  default: root
}
