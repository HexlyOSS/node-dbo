const { DboFactory, Configurer } = require('./lib/dbo')

const root = {
  DboFactory, Configurer
}

module.exports = {
  ...root,
  default: root
}
