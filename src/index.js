const _ = require('lodash')
const bel = require('bel')
const csjs = require('csjs-inject')
const queryString = require('query-string')
const parsed = queryString.parse(location.search)
const contracts = require('contracts')
const paginationButtons = require('paginationButtons')
const makeCollectionArea = require('makeCollectionArea')
let css

let contractCount = contracts.length
let pagingCount = 6

let currentPage = parsed.page ? parseInt(parsed.page) : 1
let previousPage = currentPage == 1 ? null : currentPage - 1
// let firstPage = 1
let lastPage =
  contracts.length <= pagingCount
    ? null
    : Math.ceil(contractCount / pagingCount)
let nextPage =
  lastPage != null && currentPage < lastPage ? currentPage + 1 : null

console.log(`contracts.length:${contractCount}`)
console.log(`previousPage:${previousPage}`)
console.log(`currentPage:${currentPage}`)
console.log(`lastPage:${lastPage}`)
console.log(`nextPage:${nextPage}`)

let blocks = [
  {
    like: 0,
    title: 'title 123',
    publishAt: 123,
    author: 'alin',
  },
  {
    like: 0,
    title: 'title 234',
    publishAt: 234,
    author: 'alin',
  },
  {
    like: 0,
    title: 'title 345',
    publishAt: 345,
    author: 'alin',
  },
  {
    like: 0,
    title: 'title 456',
    publishAt: 456,
    author: 'alin',
  },
]

// ===== Action =====

function clickAction() {
  location.url = ''
}

function closeAction() {
  location.url = ''
}


// window.location.href
// "http://192.168.0.163:9966/?page=1"
// window.location.origin
// "http://192.168.0.163:9966"

function start() {
  let datas = _.chunk(contracts, pagingCount)
  let currentData = datas[currentPage - 1]

  let collectionArea = makeCollectionArea(currentData)
  let opts = {nextPage, previousPage, currentPage, lastPage}
  let element = bel`
    <div>
      ${collectionArea}
      ${paginationButtons(opts)}
    </div>
  `
  document.body.appendChild(element)
}

start()
