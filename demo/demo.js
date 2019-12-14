const contractsDB = require('contracts-db')
const smartcontractcodes = require('../')

const dat = '505d45d6e9c1d08220003e7caad33402d6e815746d2a71986adeec57e07f53bf'
const cardsCount = 8
const db = contractsDB(dat, cardsCount)

const element = smartcontractcodes({
  contracts: db,
  themes: require('./themes.js'),
  cardsCount
})

document.body.appendChild(element)
