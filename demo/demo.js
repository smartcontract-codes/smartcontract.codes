const contractsDB = require('contracts-db')
const smartcontractcodes = require('../')

const dat = '505d45d6e9c1d08220003e7caad33402d6e815746d2a71986adeec57e07f53bf'
//const dat = 'c2fab67dfa344328cc2c7317019d56a2a67592186aaacdb9c8a8e17da0b57cad' //local
const cardsCount = 8
const db = contractsDB(dat, cardsCount)

const element = smartcontractcodes({
  contracts: db,
  themes: require('./themes.js'),
  cardsCount
})

document.body.appendChild(element)
