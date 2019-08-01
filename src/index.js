const bel = require('bel')
const csjs = require('csjs-inject')
let css
const header = require('header')
const search = require('search')
const pagination = require('pagination')
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
    <span class="${css.colorplate} ${css.cubeWhite}" onclick=${()=>setTheme(themes('lightTheme'))}></span>
    <span class="${css.colorplate} ${css.cubeDark}" onclick=${()=>setTheme(themes('darkTheme'))}></span>
  </div>
  `
}

require('contracts')(start)

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

function start(contracts, titles, hashes) {

  let ops = pagination(contracts)
  ops.contracts = contracts
  ops.titles = titles
  ops.hashes = hashes

  const collectionContainer =
    bel`<div>${makeCollectionArea(ops)}</div>`

  const navigation =
    bel`<div>${paginationButtons(collectionContainer, ops)}</div>`
  ops.paginationButtons = navigation

  let element = bel`
    <div class=${css.wrapper}>
      ${header()}
      <div class=${css.content}>
        ${themeSwitch()}
        ${search(ops)}
        ${collectionContainer}
        ${ops.paginationButtons}
      </div>
    </div>
  `
  document.body.appendChild(element)
}

// ===== css =====

css = csjs`
  @import url('https://fonts.googleapis.com/css?family=Nunito&display=swap');
  @import url('https://fonts.googleapis.com/css?family=Inconsolata&display=swap');
  html {
    font-size: 65%;
  }
  body {
    height: 100%;
    font-family: 'Nunito', sans-serif;
    margin: 0;
    padding: 0;
    color: var(--body-color);
    background-color: var(--body-background);
    font-size: 100%;
  }
  .wrapper {
    display: grid;
    grid-template-areas:
      "header"
      "content";
    grid-template-rows: 120px 1fr;
    padding: 0 38px;
  }
  .content {
    grid-area: content;
    display: grid;
    grid-template-areas:
      "themeSwitch"
      "search"
      "collection"
      "pagination"
  }
  a {
    text-decoration: none;
    color: var(--body-color);
  }
  button {
    border: none;
    border-radius: 4px;
    cursor: pointer;
    outline: none;
  }

  .themeSwitch {
    grid-area: themeSwitch;
    justify-self: end;
    color: var(--primary);
    padding-bottom: 15px;
  }
  h1, h2, h3, h4, h5, h6, p {
    margin: 0;
  }
  h1 {
    font-size: 6rem;
  }
  h2 {
    font-size: 5rem;
  }
  h3 {
    font-size: 4rem;
  }
  h4 {
    font-size: 3rem;
  }
  h5 {
    font-size: 2rem;
  }
  h6 {
    font-size: 1.6rem;
  }
  img {
    width: 100%;
    height: auto;
  }
  ul, li {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .colorplate {
    display: inline-block;
    width: 20px;
    height: 20px;
    margin-left: 5px;
    border: 1px solid #888;
    border-radius: 6px;
    cursor: pointer;
  }
  .cubeWhite {
    background-color: #fff;
  }
  .cubeDark {
    background-color: #1D1D26;
  }
  svg {
    width: 100%;
    height: 100%;
  }

`
