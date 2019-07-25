const _ = require('lodash')
const bel = require('bel')
const csjs = require('csjs-inject')
let css
const queryString = require('query-string')
const parsed = queryString.parse(location.search)
const search = require('search')
const paginationButtons = require('paginationButtons')
const makeCollectionArea = require('makeCollectionArea')

// ===== theme =====

const themes = require('themes')
setTheme(themes('darkTheme'))

function setThemeVar([key, value]) {
  const element = document.documentElement;
  element.style.setProperty(key, value);
}

function setTheme (theme) {
  let arr = Object.entries(theme)
  for (var i = 0; i < arr.length; i++) {
    setThemeVar(arr[i])
  }
}

function themeSwitch () {
  return bel`
  <div class=${css.themeSwitch}>
  <div onclick=${()=>setTheme(themes('lightTheme'))}>Light theme/</div>
  <div onclick=${()=>setTheme(themes('darkTheme'))}>/Dark theme</div>
  </div>
  `
}
const contracts = require('contracts')(start)
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

function start(contracts) {

  // ===== pagination =====

  let contractCount = contracts.length
  let pagingCount = 8 // cards displayed per page

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

  let datas = _.chunk(contracts, pagingCount)
  let currentData = datas[currentPage - 1]

  let collectionArea = makeCollectionArea(currentData)
  let opts = {nextPage, previousPage, currentPage, lastPage}
  let element = bel`
    <div>
      ${themeSwitch()}
      ${search()}
      ${collectionArea}
      ${paginationButtons(opts)}
    </div>
  `
  document.body.appendChild(element)
}

// ===== css =====

css = csjs`
  body {
    background-color: var(--background)
  }
  .themeSwitch {
    display: flex;
    color: var(--primary)
  }
`

// ===== Start =====
start()
