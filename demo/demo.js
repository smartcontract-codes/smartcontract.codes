const contractsDB = require('contracts-db')
const smartcontractcodes = require('../')

const dat = '48a050618e16da68395cbe8fd7b3c0b0df667dab1fcdb1b0f1094f5bf6466ca4'
const cardsCount = 8
const db = contractsDB(dat, cardsCount)

const element = smartcontractcodes({
  contracts: db,
  themes: require('./themes.js'),
  cardsCount
})

document.body.appendChild(element)
