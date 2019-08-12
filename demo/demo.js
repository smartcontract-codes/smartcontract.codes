const contractsDB = require('contracts-db')
const smartcontractcodes = require('../')

//const daturl = 'dat://ee970fe30a2b564475eb0468acf3de9363fb6b6ef775de26fc3be90ec7dbed72'
const daturl = 'dat://786130fdd86da6cd579669b6075049cb589f12cbe4c8bf5d9fe350c1b677c5d6'
const db = contractsDB(daturl)

const element = smartcontractcodes({
  contracts: db,
  themes: require('./themes.js')
})

document.body.appendChild(element)
