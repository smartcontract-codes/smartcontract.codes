const contractsDB = require('contracts-db')
const smartcontractcodes = require('../')

const daturl = 'dat://c610858d82e4c9bc9585bb26fedb260c080ed24c6a05bcf3da9ad73a6917ac82/'
const db = contractsDB(daturl)

const element = smartcontractcodes({
  contracts: db,
  themes: require('./themes.js')
})

document.body.appendChild(element)
