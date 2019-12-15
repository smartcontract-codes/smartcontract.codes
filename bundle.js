(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/demo/demo.js":[function(require,module,exports){
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

},{"../":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/src/app.js","./themes.js":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/demo/themes.js","contracts-db":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/demo/node_modules/contracts-db/index.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/demo/node_modules/contracts-db/index.js":[function(require,module,exports){
(function (Buffer){
const hypercore = require('hypercore')
const hypertrie = require('hypertrie')
const ram = require('random-access-memory')
let samples = require('./samples')
const eos = require('end-of-stream')
const HyperswarmClient = require('hyperswarm-proxy-ws/client')
const swarm = new HyperswarmClient({ proxy: 'wss://188.166.164.180:3472' })

module.exports = contractsDB

function contractsDB (dat, pageSize) {
  let ids = 1
  const cancelled = {}
  let queue = []
  let isReady = false

  const key = Buffer.from(dat, "hex")
  const feed = new hypercore(ram, key)
  const trie = hypertrie(null, { feed })
  swarm.on('connection', (connection, info) => {
    console.log('connection found')
    connection.pipe(feed.replicate(info.client)).pipe(connection)
    eos(connection, function(err) {
      // this will be set to the stream instance
      if (err) return console.log('stream had an error or closed early', err);
      console.log('stream has ended', this === connection);
    });
    console.log('SWARM CONNECTIONS', swarm.connections)
  })
  swarm.join(key)

  isReallyReady()
  return { getStream, getBatch, search, cancel, getPagesCount, getSamples }

  function reallyReady (trie, cb) {
    if (trie.feed.peers.length) {
      trie.feed.update({ ifAvailable: true }, cb)
    } else {
      trie.feed.once('peer-add', () => {
        trie.feed.update({ ifAvailable: true }, cb)
      })
    }
  }

  function isReallyReady () {
    trie.ready(() => {
      console.log('Loaded trie', dat)
      reallyReady(trie, () => {
        console.log('READY')
        isReady = true
        var _queue = queue
        queue = []
        _queue.forEach(f => f())
      })
    })
  }

  async function getSamples (filter, cb) {
    let sampleContracts = {Basic: [], Audited: [], New: [], Featured: [], Popular: [], OpenZeppelin: []}
    const filterContracts = JSON.parse(samples)[filter]
    for(var i = 0; i < filterContracts.length; i++) {
      const name = filterContracts[i]
      const url = `${window.location.origin}/demo/node_modules/contracts-db/sampleContracts/${name}.sol`
      const file = await fetch(url)
      const code = await file.text()
      const jsonUrl = `${window.location.origin}/demo/node_modules/contracts-db/samples.json`
      const jsonFile = await fetch(jsonUrl)
      const jsonData = await jsonFile.text()
      sampleContracts[filter].push({
        source: code,
        title: name,
        hash: '0x0000000000000000000000',
        metadata: jsonData
      })
    }
    cb(null, sampleContracts)
  }

  function getStream (notify) {
    trie.ready(() => {
      console.log('Loaded trie', dat)
      reallyReady(trie, () => {
        console.log('READY')
        trie.createReadStream()
        .on('data', data => notify(data))
        .on('end', _ => notify('end'))
      })
    })
  }

  function getBatch (currentPage, cardsCount, done) {
    var contracts = []
    if (isReady) _getBatch()
    else queue.push(_getBatch)
    function _getBatch () {
      console.log('READY')
      const from = (currentPage-1)*cardsCount
      const to = currentPage*cardsCount
      const prefix = from.toString().padStart(10, '0').split(0, from.length)
      const readStream = trie.createReadStream()
      .on('data', res => {
        console.log(res.key)
        const data = JSON.parse(res.value.toString('utf8'))
        contracts.push({
          source: data.sourceCode,
          title: data.contractName,
          hash: data.address,
          metadata: data
        })
        if (contracts.length === to) {
          console.log(to)
          console.log(contracts.slice(from, to))
          done(null, contracts.slice(from, to))
          readStream.on('close', console.log('stream closed'))
        }
      })
      //swarm.leave(key)
    }
  }

  function search (query, notify) {
    const id = ids++
    trie.createReadStream()
    .on('data', res => {
      const data = JSON.parse(res.value.toString('utf8'))
      const temp = normalizeWS(data.sourceCode.toString('utf8'))
      const formattedQuery = normalizeWS(query)
      if (temp.includes(formattedQuery)) {
        if (!cancelled[id]) {
          notify({
            type: 'searchResult',
            id,
            body: data
          })
        }
      }
    })
    .on('end', _ => notify({
      type: 'searchResult',
      id,
      body: 'end'
    }))
    return id
  }

  function normalizeWS(s) {
    // searchInput.replace(/\n. |\r/g, "")
    s = s.match(/\S+/g);
    return s ? s.join(' ') : '';
  }

  function cancel (id) {
    cancelled[id] = true
  }

  function getPagesCount (done) {
    return done(null, Math.floor(trie.feed.length/pageSize))
  }

}

}).call(this,require("buffer").Buffer)
},{"./samples":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/demo/node_modules/contracts-db/samples.json","buffer":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/buffer/index.js","end-of-stream":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/end-of-stream/index.js","hypercore":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hypercore/index.js","hyperswarm-proxy-ws/client":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hyperswarm-proxy-ws/client.js","hypertrie":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hypertrie/index.js","random-access-memory":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/random-access-memory/index.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/demo/node_modules/contracts-db/samples.json":[function(require,module,exports){
module.exports=module.exports = `
{
  "Basic": [
    "HelloBlockchain",
    "SimpleStorage",
    "SimpleMarketplace",
    "VeryBasicToken",
    "Ballot",
    "Auction",
    "Escrow",
    "Casino",
    "ShowTime",
    "Transfer",
    "TravelAgency",
    "ERC20",
    "AssetTransfer",
    "BasicProvenance",
    "DefectiveComponentCounter",
    "DigitalLocker",
    "FrequentFlyerRewardsCalculator",
    "Moloch",
    "TodoList",
    "PaymentSplitter",
    "PingPongGame",
    "ProvableTempOracle",
    "RefrigeratedTransportation",
    "RoomThermostat"
  ],
  "OpenZeppelin": []
}
`

},{}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/demo/themes.js":[function(require,module,exports){
module.exports = select

function select (theme = 'darkTheme') {
  return themes[theme]
}

// define colors
const bluePurple = '#6700ff'
const lightGreen = '#09FFC3'
const lightGreenHover = '#A1FFE8'
const greyEB = '#EBEBEB'
const grey8D = '#8D8D8D'
const greyD8 = '#D8D8D8'
const grey31 = '#313136'
const grey33 = '#333333'
const greyBB = '#BBBBBB'
const grey5E = '#5E5E5E'
const white = '#ffffff'
const dark18 = '#181920'
const dark1d = '#1d1d26'
const peach = 'rgba(255, 41,117, 100)'
const transparent = 'rgba(0,0,0,0)'
const black = '#000'

// define font
const fontNunito = `'Nunito', sans-serif`
const fontInconsolata = `'Inconsolata', monospace`

const lightTheme = {
  '--main-font': fontNunito,
  '--code-font': fontInconsolata,
  '--h1': '6rem',
  '--h2': '5rem',
  '--h3': '4rem',
  '--h4': '3rem',
  '--h5': '2rem',
  '--h6': '1.6rem',
  '--body-color': grey33,
  '--body-background': greyEB,
  '--button-default': lightGreen,
  '--button-default-hover': white,
  '--button-default-font-size': '1.8rem',
  '--button-default-text': dark1d,
  '--button-default-text-hover': dark1d,
  '--button-default-radius': '22px',
  '--button-default-padding': '10px 30px',
  '--button-padding-right': '30px',
  '--button-padding-left': '30px',
  '--button-border': '0px solid var(--button-white)',
  '--button-box-shadow': 'none',
  '--editor-preview': white,
  '--card-cover': greyEB,
  '--card-hover-cover': lightGreen,
  '--card-cover-border': transparent,
  '--card-cover-radius': '0 0 4px 4px',
  '--card--hover-cover-radius': '4px',
  '--card-border': transparent,
  '--card-hover-border': '0px solid var(--card-border)',
  '--card-code-overlay': 'linear-gradient(0deg, rgba(0,0,0, .1) 0%, rgba(0,0,0, .28) 100%)',
  '--card-shadow': '0px 6px 8px rgba(144, 144, 144, .3)',
  '--card-hover-shadow': '0px 6px 8px rgba(144, 144, 144, .3)',
  '--card-code-text': '1.3rem',
  '--card-cover-title': grey31,
  '--card-hover-cover-title': grey31,
  '--card-cover-userInfo': grey33,
  '--card-time': grey8D,
  '--card-hover-time': grey8D,
  '--card-visit-icons-fill': dark1d,
  '--card-icon-fill': dark1d,
  '--search-input': `1px solid var(--search-input-border)`,
  '--search-input-border': 'rgba(255,255,255, 0)',
  '--search-input-background': '#F3F7FD',
  '--search-input-color': grey8D,
  '--search-input-text': '1.4rem',
  '--search-icon-fill': dark1d,
  '--search-button-color': dark1d,
  '--search-button-background': 'rgba(9,255,195, 0)',
  '--search-button-hover-background': 'rgba(9,255,195, 1)',
  '--text-large': '2rem',
  '--text-normal': '1.6rem',
  '--text-small': '1.4rem',
  '--text-xsmall': '1.2rem',
  '--pages-current-background': white,
  '--pages-border': '0px solid rgba(0,0,0,0)',
  '--pages-text': grey8D,
  '--pages-text-active': dark1d,
  '--pages-text-border-radius': '4px',
  '--pages-hover-background': white,
  '--grid-template': '',
  '--icon-new-fill': dark1d,
  '--button-icon-fill': dark1d,
  '--collectionArea-grid-gap': '30px',
  '--collectionCard-border-radius': '6px',
  '--pages-li-color': grey8D,
  '--notify-background-color': lightGreen,
  '--placeholder': grey8D,
  '--search-input-shadow': 'rgba(0, 0, 0, .3)',
  '--search-input-line-height': '20px',
  '--header-background': white,
  '--button-sticker': white,
  '--button-sticker-hover': lightGreen,
  '--number-border': 'none',
  '--number-background' : '#F3F7FD',
  '--number-color': grey31,
  '--switch-current-border-color': 'orange',
  '--footer-icon-fill': grey31,
  '--footer-icon-hover-fill': lightGreen,
  '--footer-nav-background': white,
  '--footer-copy-rights': grey8D,
  '--filters-a-hover': lightGreen,
  '--filters-border-color': lightGreen,
  '--themeSwitch-background': 'rgba(0,0,0, .1)',
  '--tab-color': grey8D,
  '--tab-background': greyD8,
  '--tab-hover-background': lightGreen,
  '--tab-border-color': transparent,
  '--tab-active-color': black,
  '--tab-active-background': lightGreen,
  '--tab-active-border-color': transparent,
  '--tab-active-box-shadow': 'rgba(144,144,144, .3)'
}

const darkTheme = {
  '--main-font': fontNunito,
  '--code-font': fontInconsolata,
  '--h1': '6rem',
  '--h2': '5rem',
  '--h3': '4rem',
  '--h4': '3rem',
  '--h5': '2rem',
  '--h6': '1.6rem',
  '--body-color': white,
  '--body-background': dark18,
  '--button-default': transparent,
  '--button-default-hover': bluePurple,
  '--button-default-font-size': '1.8rem',
  '--button-default-text': peach,
  '--button-default-text-hover': peach,
  '--button-default-radius': '22px',
  '--button-default-padding': '10px 30px',
  '--button-padding-right': '30px',
  '--button-padding-left': '30px',
  '--button-border': '1px solid #6700ff',
  '--button-box-shadow': '0 1px 8px rgba(255,41,117, .3)',
  '--editor-preview': dark1d,
  '--card-cover': grey31,
  '--card-hover-cover': 'bluePurple',
  '--card-cover-border': transparent,
  '--card-border': bluePurple,
  '--card-hover-border': '1px solid var(--card-border)',
  '--card-code-overlay': 'linear-gradient(0deg, rgba(103,0,255, .1) 0%, rgba(103,0,255, .28) 100%)',
  '--card-shadow': '0px 2px 30px rgba(103, 0, 255, 0)',
  '--card-hover-shadow': '0px 2px 30px rgba(103, 0, 255, .6)',
  '--card-code-text': '1.3rem',
  '--card-code-text-line-height': '20px',
  '--card-cover-title': lightGreen,
  '--card-hover-cover-title': white,
  '--card-cover-userInfo': white,
  '--card-time': greyBB,
  '--card-hover-time': white,
  '--card-visit-icons-fill': white,
  '--card-icon-fill': white,
  '--search-input': `1px solid var(--search-input-border)`,
  '--search-input-border': bluePurple,
  '--search-input-background': dark1d,
  '--search-input-color': lightGreen,
  '--search-input-text': '1.4rem',
  '--search-icon-fill': lightGreen,
  '--search-button-color': white,
  '--search-button-background': 'rgba(103, 0, 255, 0)',
  '--search-button-hover-background': 'rgba(103, 0, 255, 1)',
  '--text-large': '2rem',
  '--text-normal': '1.6rem',
  '--text-small': '1.4rem',
  '--text-xsmall': '1.2rem',
  '--pages-current-background': transparent,
  '--pages-border': '1px solid #6700ff',
  '--pages-text': peach,
  '--pages-text-active': white,
  '--pages-text-border-radius': '4px',
  '--pages-hover-background': bluePurple,
  '--grid-template': '',
  '--icon-new-fill': white,
  '--button-icon-fill': white,
  '--collectionArea-grid-gap': '30px',
  '--collectionCard-border-radius': '6px',
  '--notify-background-color': lightGreen,
  '--placeholder': grey8D,
  '--search-input-shadow': 'none',
  '--search-input-line-height': '20px',
  '--header-background': dark1d,
  '--button-sticker': '#3B0093',
  '--button-sticker-hover': bluePurple,
  '--number-border': `1px solid ${bluePurple}`,
  '--number-background' : transparent,
  '--number-color': white,
  '--switch-current-border-color': 'orange',
  '--footer-icon-fill': lightGreen,
  '--footer-icon-hover-fill': white,
  '--footer-nav-background': dark1d,
  '--footer-copy-rights': grey8D,
  '--filters-a-hover': lightGreen,
  '--filters-border-color': bluePurple,
  '--themeSwitch-background': 'rgba(255,255,255, .9)',
  '--tab-color': '#65656B',
  '--tab-background': '#1D1D26',
  '--tab-hover-background': bluePurple,
  '--tab-border-color': '#2F2B36',
  '--tab-active-color': white,
  '--tab-active-background': bluePurple,
  '--tab-active-border-color': bluePurple,
  '--tab-active-box-shadow': 'rgba(103,0,255, .3)'
}
const themes = { lightTheme, darkTheme }
select.names = Object.keys(themes)

},{}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/array-lru/crc16.js":[function(require,module,exports){
// crc16 impl, optimized for numeric inputs

var TABLE = [
  0x0000, 0x1021, 0x2042, 0x3063, 0x4084, 0x50a5, 0x60c6, 0x70e7,
  0x8108, 0x9129, 0xa14a, 0xb16b, 0xc18c, 0xd1ad, 0xe1ce, 0xf1ef,
  0x1231, 0x0210, 0x3273, 0x2252, 0x52b5, 0x4294, 0x72f7, 0x62d6,
  0x9339, 0x8318, 0xb37b, 0xa35a, 0xd3bd, 0xc39c, 0xf3ff, 0xe3de,
  0x2462, 0x3443, 0x0420, 0x1401, 0x64e6, 0x74c7, 0x44a4, 0x5485,
  0xa56a, 0xb54b, 0x8528, 0x9509, 0xe5ee, 0xf5cf, 0xc5ac, 0xd58d,
  0x3653, 0x2672, 0x1611, 0x0630, 0x76d7, 0x66f6, 0x5695, 0x46b4,
  0xb75b, 0xa77a, 0x9719, 0x8738, 0xf7df, 0xe7fe, 0xd79d, 0xc7bc,
  0x48c4, 0x58e5, 0x6886, 0x78a7, 0x0840, 0x1861, 0x2802, 0x3823,
  0xc9cc, 0xd9ed, 0xe98e, 0xf9af, 0x8948, 0x9969, 0xa90a, 0xb92b,
  0x5af5, 0x4ad4, 0x7ab7, 0x6a96, 0x1a71, 0x0a50, 0x3a33, 0x2a12,
  0xdbfd, 0xcbdc, 0xfbbf, 0xeb9e, 0x9b79, 0x8b58, 0xbb3b, 0xab1a,
  0x6ca6, 0x7c87, 0x4ce4, 0x5cc5, 0x2c22, 0x3c03, 0x0c60, 0x1c41,
  0xedae, 0xfd8f, 0xcdec, 0xddcd, 0xad2a, 0xbd0b, 0x8d68, 0x9d49,
  0x7e97, 0x6eb6, 0x5ed5, 0x4ef4, 0x3e13, 0x2e32, 0x1e51, 0x0e70,
  0xff9f, 0xefbe, 0xdfdd, 0xcffc, 0xbf1b, 0xaf3a, 0x9f59, 0x8f78,
  0x9188, 0x81a9, 0xb1ca, 0xa1eb, 0xd10c, 0xc12d, 0xf14e, 0xe16f,
  0x1080, 0x00a1, 0x30c2, 0x20e3, 0x5004, 0x4025, 0x7046, 0x6067,
  0x83b9, 0x9398, 0xa3fb, 0xb3da, 0xc33d, 0xd31c, 0xe37f, 0xf35e,
  0x02b1, 0x1290, 0x22f3, 0x32d2, 0x4235, 0x5214, 0x6277, 0x7256,
  0xb5ea, 0xa5cb, 0x95a8, 0x8589, 0xf56e, 0xe54f, 0xd52c, 0xc50d,
  0x34e2, 0x24c3, 0x14a0, 0x0481, 0x7466, 0x6447, 0x5424, 0x4405,
  0xa7db, 0xb7fa, 0x8799, 0x97b8, 0xe75f, 0xf77e, 0xc71d, 0xd73c,
  0x26d3, 0x36f2, 0x0691, 0x16b0, 0x6657, 0x7676, 0x4615, 0x5634,
  0xd94c, 0xc96d, 0xf90e, 0xe92f, 0x99c8, 0x89e9, 0xb98a, 0xa9ab,
  0x5844, 0x4865, 0x7806, 0x6827, 0x18c0, 0x08e1, 0x3882, 0x28a3,
  0xcb7d, 0xdb5c, 0xeb3f, 0xfb1e, 0x8bf9, 0x9bd8, 0xabbb, 0xbb9a,
  0x4a75, 0x5a54, 0x6a37, 0x7a16, 0x0af1, 0x1ad0, 0x2ab3, 0x3a92,
  0xfd2e, 0xed0f, 0xdd6c, 0xcd4d, 0xbdaa, 0xad8b, 0x9de8, 0x8dc9,
  0x7c26, 0x6c07, 0x5c64, 0x4c45, 0x3ca2, 0x2c83, 0x1ce0, 0x0cc1,
  0xef1f, 0xff3e, 0xcf5d, 0xdf7c, 0xaf9b, 0xbfba, 0x8fd9, 0x9ff8,
  0x6e17, 0x7e36, 0x4e55, 0x5e74, 0x2e93, 0x3eb2, 0x0ed1, 0x1ef0
]

module.exports = crc16

function crc16 (n) {
  var crc = 0
  var r = 0

  for (var i = 0; i < 8; i++) {
    r = n & 0xff
    n = (n - r) / 256
    crc = ((crc << 8) ^ TABLE[((crc >> 8) ^ r) & 0xff]) & 0xffff
  }

  return crc
}

},{}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/array-lru/index.js":[function(require,module,exports){
var hash = require('./crc16')

module.exports = LRU

function LRU (max, opts) {
  if (!(this instanceof LRU)) return new LRU(max, opts)
  if (!opts) opts = {}

  // how many collisions before evicting (factor of two for fast modulo)
  this.collisions = factorOfTwo(opts.collisions || opts.bucketSize || 4)
  // buckets should be a factor of two for fast modulo as well
  this.buckets = factorOf(max, this.collisions) / this.collisions

  // we use 16bit hashing to bucket index must be <0xffff
  while (this.buckets > 65536) {
    this.buckets >>= 1
    this.collisions <<= 1
  }

  this.size = this.buckets * this.collisions
  this.wrap = !opts.indexedValues
  this.cache = new Array(this.size)
  this.hash = this.buckets === 65536 ? hash : maskedHash(this.buckets - 1)
  this.evict = opts.evict || null
}

LRU.prototype.set = function (index, val) {
  var pageStart = this.collisions * this.hash(index)
  var pageEnd = pageStart + this.collisions
  var ptr = pageStart
  var page = null

  while (ptr < pageEnd) {
    page = this.cache[ptr]

    if (!page) {
      // no exiting version, but we have space to store it
      page = this.cache[ptr] = this.wrap ? new Node(index, val) : val
      move(this.cache, pageStart, ptr, page)
      return
    }

    if (page.index === index) {
      // update existing version and move to head of bucket
      if (this.wrap) page.value = val
      else this.cache[ptr] = val
      move(this.cache, pageStart, ptr, page)
      return
    }

    ptr++
  }

  // bucket is full, update oldest (last element in bucket)
  if (this.wrap) {
    if (this.evict) this.evict(page.index, page.value)
    page.index = index
    page.value = val
  } else {
    if (this.evict) this.evict(page.index, page)
    this.cache[ptr - 1] = val
  }
  move(this.cache, pageStart, ptr - 1, page)
}

LRU.prototype.get = function (index) {
  var pageStart = this.collisions * this.hash(index)
  var pageEnd = pageStart + this.collisions
  var ptr = pageStart

  while (ptr < pageEnd) {
    var page = this.cache[ptr++]

    if (!page) return null
    if (page.index !== index) continue

    // we found it! move to head of bucket and return value
    move(this.cache, pageStart, ptr - 1, page)

    return this.wrap ? page.value : page
  }

  return null
}

function move (list, index, itemIndex, item) {
  while (itemIndex > index) list[itemIndex] = list[--itemIndex]
  list[index] = item
}

function Node (index, value) {
  this.index = index
  this.value = value
}

function factorOf (n, factor) {
  n = factorOfTwo(n)
  while (n & (factor - 1)) n <<= 1
  return n
}

function factorOfTwo (n) {
  if (n && !(n & (n - 1))) return n
  var p = 1
  while (p < n) p <<= 1
  return p
}

function maskedHash (mask) {
  return function (n) {
    return hash(n) & mask
  }
}

},{"./crc16":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/array-lru/crc16.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/atomic-batcher/index.js":[function(require,module,exports){
module.exports = batcher

function batcher (run) {
  var running = false
  var pendingBatch = null
  var pendingCallbacks = null
  var callbacks = null

  return append

  function done (err) {
    if (callbacks) callAll(callbacks, err)

    running = false
    callbacks = pendingCallbacks
    var nextBatch = pendingBatch

    pendingBatch = null
    pendingCallbacks = null

    if (!nextBatch || !nextBatch.length) {
      if (!callbacks || !callbacks.length) {
        callbacks = null
        return
      }
      if (!nextBatch) nextBatch = []
    }

    running = true
    run(nextBatch, done)
  }

  function append (val, cb) {
    if (running) {
      if (!pendingBatch) {
        pendingBatch = []
        pendingCallbacks = []
      }
      pushAll(pendingBatch, val)
      if (cb) pendingCallbacks.push(cb)
    } else {
      if (cb) callbacks = [cb]
      running = true
      run(Array.isArray(val) ? val : [val], done)
    }
  }
}

function pushAll (list, val) {
  if (Array.isArray(val)) pushArray(list, val)
  else list.push(val)
}

function pushArray (list, val) {
  for (var i = 0; i < val.length; i++) list.push(val[i])
}

function callAll (list, err) {
  for (var i = 0; i < list.length; i++) list[i](err)
}

},{}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/base64-js/index.js":[function(require,module,exports){
'use strict'

exports.byteLength = byteLength
exports.toByteArray = toByteArray
exports.fromByteArray = fromByteArray

var lookup = []
var revLookup = []
var Arr = typeof Uint8Array !== 'undefined' ? Uint8Array : Array

var code = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
for (var i = 0, len = code.length; i < len; ++i) {
  lookup[i] = code[i]
  revLookup[code.charCodeAt(i)] = i
}

// Support decoding URL-safe base64 strings, as Node.js does.
// See: https://en.wikipedia.org/wiki/Base64#URL_applications
revLookup['-'.charCodeAt(0)] = 62
revLookup['_'.charCodeAt(0)] = 63

function getLens (b64) {
  var len = b64.length

  if (len % 4 > 0) {
    throw new Error('Invalid string. Length must be a multiple of 4')
  }

  // Trim off extra bytes after placeholder bytes are found
  // See: https://github.com/beatgammit/base64-js/issues/42
  var validLen = b64.indexOf('=')
  if (validLen === -1) validLen = len

  var placeHoldersLen = validLen === len
    ? 0
    : 4 - (validLen % 4)

  return [validLen, placeHoldersLen]
}

// base64 is 4/3 + up to two characters of the original data
function byteLength (b64) {
  var lens = getLens(b64)
  var validLen = lens[0]
  var placeHoldersLen = lens[1]
  return ((validLen + placeHoldersLen) * 3 / 4) - placeHoldersLen
}

function _byteLength (b64, validLen, placeHoldersLen) {
  return ((validLen + placeHoldersLen) * 3 / 4) - placeHoldersLen
}

function toByteArray (b64) {
  var tmp
  var lens = getLens(b64)
  var validLen = lens[0]
  var placeHoldersLen = lens[1]

  var arr = new Arr(_byteLength(b64, validLen, placeHoldersLen))

  var curByte = 0

  // if there are placeholders, only get up to the last complete 4 chars
  var len = placeHoldersLen > 0
    ? validLen - 4
    : validLen

  var i
  for (i = 0; i < len; i += 4) {
    tmp =
      (revLookup[b64.charCodeAt(i)] << 18) |
      (revLookup[b64.charCodeAt(i + 1)] << 12) |
      (revLookup[b64.charCodeAt(i + 2)] << 6) |
      revLookup[b64.charCodeAt(i + 3)]
    arr[curByte++] = (tmp >> 16) & 0xFF
    arr[curByte++] = (tmp >> 8) & 0xFF
    arr[curByte++] = tmp & 0xFF
  }

  if (placeHoldersLen === 2) {
    tmp =
      (revLookup[b64.charCodeAt(i)] << 2) |
      (revLookup[b64.charCodeAt(i + 1)] >> 4)
    arr[curByte++] = tmp & 0xFF
  }

  if (placeHoldersLen === 1) {
    tmp =
      (revLookup[b64.charCodeAt(i)] << 10) |
      (revLookup[b64.charCodeAt(i + 1)] << 4) |
      (revLookup[b64.charCodeAt(i + 2)] >> 2)
    arr[curByte++] = (tmp >> 8) & 0xFF
    arr[curByte++] = tmp & 0xFF
  }

  return arr
}

function tripletToBase64 (num) {
  return lookup[num >> 18 & 0x3F] +
    lookup[num >> 12 & 0x3F] +
    lookup[num >> 6 & 0x3F] +
    lookup[num & 0x3F]
}

function encodeChunk (uint8, start, end) {
  var tmp
  var output = []
  for (var i = start; i < end; i += 3) {
    tmp =
      ((uint8[i] << 16) & 0xFF0000) +
      ((uint8[i + 1] << 8) & 0xFF00) +
      (uint8[i + 2] & 0xFF)
    output.push(tripletToBase64(tmp))
  }
  return output.join('')
}

function fromByteArray (uint8) {
  var tmp
  var len = uint8.length
  var extraBytes = len % 3 // if we have 1 byte left, pad 2 bytes
  var parts = []
  var maxChunkLength = 16383 // must be multiple of 3

  // go through the array every three bytes, we'll deal with trailing stuff later
  for (var i = 0, len2 = len - extraBytes; i < len2; i += maxChunkLength) {
    parts.push(encodeChunk(
      uint8, i, (i + maxChunkLength) > len2 ? len2 : (i + maxChunkLength)
    ))
  }

  // pad the end with zeros, but make sure to not forget the extra bytes
  if (extraBytes === 1) {
    tmp = uint8[len - 1]
    parts.push(
      lookup[tmp >> 2] +
      lookup[(tmp << 4) & 0x3F] +
      '=='
    )
  } else if (extraBytes === 2) {
    tmp = (uint8[len - 2] << 8) + uint8[len - 1]
    parts.push(
      lookup[tmp >> 10] +
      lookup[(tmp >> 4) & 0x3F] +
      lookup[(tmp << 2) & 0x3F] +
      '='
    )
  }

  return parts.join('')
}

},{}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/bel/appendChild.js":[function(require,module,exports){
var trailingNewlineRegex = /\n[\s]+$/
var leadingNewlineRegex = /^\n[\s]+/
var trailingSpaceRegex = /[\s]+$/
var leadingSpaceRegex = /^[\s]+/
var multiSpaceRegex = /[\n\s]+/g

var TEXT_TAGS = [
  'a', 'abbr', 'b', 'bdi', 'bdo', 'br', 'cite', 'data', 'dfn', 'em', 'i',
  'kbd', 'mark', 'q', 'rp', 'rt', 'rtc', 'ruby', 's', 'amp', 'small', 'span',
  'strong', 'sub', 'sup', 'time', 'u', 'var', 'wbr'
]

var VERBATIM_TAGS = [
  'code', 'pre', 'textarea'
]

module.exports = function appendChild (el, childs) {
  if (!Array.isArray(childs)) return

  var nodeName = el.nodeName.toLowerCase()

  var hadText = false
  var value, leader

  for (var i = 0, len = childs.length; i < len; i++) {
    var node = childs[i]
    if (Array.isArray(node)) {
      appendChild(el, node)
      continue
    }

    if (typeof node === 'number' ||
      typeof node === 'boolean' ||
      typeof node === 'function' ||
      node instanceof Date ||
      node instanceof RegExp) {
      node = node.toString()
    }

    var lastChild = el.childNodes[el.childNodes.length - 1]

    // Iterate over text nodes
    if (typeof node === 'string') {
      hadText = true

      // If we already had text, append to the existing text
      if (lastChild && lastChild.nodeName === '#text') {
        lastChild.nodeValue += node

      // We didn't have a text node yet, create one
      } else {
        node = document.createTextNode(node)
        el.appendChild(node)
        lastChild = node
      }

      // If this is the last of the child nodes, make sure we close it out
      // right
      if (i === len - 1) {
        hadText = false
        // Trim the child text nodes if the current node isn't a
        // node where whitespace matters.
        if (TEXT_TAGS.indexOf(nodeName) === -1 &&
          VERBATIM_TAGS.indexOf(nodeName) === -1) {
          value = lastChild.nodeValue
            .replace(leadingNewlineRegex, '')
            .replace(trailingSpaceRegex, '')
            .replace(trailingNewlineRegex, '')
            .replace(multiSpaceRegex, ' ')
          if (value === '') {
            el.removeChild(lastChild)
          } else {
            lastChild.nodeValue = value
          }
        } else if (VERBATIM_TAGS.indexOf(nodeName) === -1) {
          // The very first node in the list should not have leading
          // whitespace. Sibling text nodes should have whitespace if there
          // was any.
          leader = i === 0 ? '' : ' '
          value = lastChild.nodeValue
            .replace(leadingNewlineRegex, leader)
            .replace(leadingSpaceRegex, ' ')
            .replace(trailingSpaceRegex, '')
            .replace(trailingNewlineRegex, '')
            .replace(multiSpaceRegex, ' ')
          lastChild.nodeValue = value
        }
      }

    // Iterate over DOM nodes
    } else if (node && node.nodeType) {
      // If the last node was a text node, make sure it is properly closed out
      if (hadText) {
        hadText = false

        // Trim the child text nodes if the current node isn't a
        // text node or a code node
        if (TEXT_TAGS.indexOf(nodeName) === -1 &&
          VERBATIM_TAGS.indexOf(nodeName) === -1) {
          value = lastChild.nodeValue
            .replace(leadingNewlineRegex, '')
            .replace(trailingNewlineRegex, '')
            .replace(multiSpaceRegex, ' ')

          // Remove empty text nodes, append otherwise
          if (value === '') {
            el.removeChild(lastChild)
          } else {
            lastChild.nodeValue = value
          }
        // Trim the child nodes if the current node is not a node
        // where all whitespace must be preserved
        } else if (VERBATIM_TAGS.indexOf(nodeName) === -1) {
          value = lastChild.nodeValue
            .replace(leadingSpaceRegex, ' ')
            .replace(leadingNewlineRegex, '')
            .replace(trailingNewlineRegex, '')
            .replace(multiSpaceRegex, ' ')
          lastChild.nodeValue = value
        }
      }

      // Store the last nodename
      var _nodeName = node.nodeName
      if (_nodeName) nodeName = _nodeName.toLowerCase()

      // Append the node to the DOM
      el.appendChild(node)
    }
  }
}

},{}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/bel/browser.js":[function(require,module,exports){
var hyperx = require('hyperx')
var appendChild = require('./appendChild')

var SVGNS = 'http://www.w3.org/2000/svg'
var XLINKNS = 'http://www.w3.org/1999/xlink'

var BOOL_PROPS = [
  'autofocus', 'checked', 'defaultchecked', 'disabled', 'formnovalidate',
  'indeterminate', 'readonly', 'required', 'selected', 'willvalidate'
]

var COMMENT_TAG = '!--'

var SVG_TAGS = [
  'svg', 'altGlyph', 'altGlyphDef', 'altGlyphItem', 'animate', 'animateColor',
  'animateMotion', 'animateTransform', 'circle', 'clipPath', 'color-profile',
  'cursor', 'defs', 'desc', 'ellipse', 'feBlend', 'feColorMatrix',
  'feComponentTransfer', 'feComposite', 'feConvolveMatrix',
  'feDiffuseLighting', 'feDisplacementMap', 'feDistantLight', 'feFlood',
  'feFuncA', 'feFuncB', 'feFuncG', 'feFuncR', 'feGaussianBlur', 'feImage',
  'feMerge', 'feMergeNode', 'feMorphology', 'feOffset', 'fePointLight',
  'feSpecularLighting', 'feSpotLight', 'feTile', 'feTurbulence', 'filter',
  'font', 'font-face', 'font-face-format', 'font-face-name', 'font-face-src',
  'font-face-uri', 'foreignObject', 'g', 'glyph', 'glyphRef', 'hkern', 'image',
  'line', 'linearGradient', 'marker', 'mask', 'metadata', 'missing-glyph',
  'mpath', 'path', 'pattern', 'polygon', 'polyline', 'radialGradient', 'rect',
  'set', 'stop', 'switch', 'symbol', 'text', 'textPath', 'title', 'tref',
  'tspan', 'use', 'view', 'vkern'
]

function belCreateElement (tag, props, children) {
  var el

  // If an svg tag, it needs a namespace
  if (SVG_TAGS.indexOf(tag) !== -1) {
    props.namespace = SVGNS
  }

  // If we are using a namespace
  var ns = false
  if (props.namespace) {
    ns = props.namespace
    delete props.namespace
  }

  // Create the element
  if (ns) {
    el = document.createElementNS(ns, tag)
  } else if (tag === COMMENT_TAG) {
    return document.createComment(props.comment)
  } else {
    el = document.createElement(tag)
  }

  // Create the properties
  for (var p in props) {
    if (props.hasOwnProperty(p)) {
      var key = p.toLowerCase()
      var val = props[p]
      // Normalize className
      if (key === 'classname') {
        key = 'class'
        p = 'class'
      }
      // The for attribute gets transformed to htmlFor, but we just set as for
      if (p === 'htmlFor') {
        p = 'for'
      }
      // If a property is boolean, set itself to the key
      if (BOOL_PROPS.indexOf(key) !== -1) {
        if (val === 'true') val = key
        else if (val === 'false') continue
      }
      // If a property prefers being set directly vs setAttribute
      if (key.slice(0, 2) === 'on') {
        el[p] = val
      } else {
        if (ns) {
          if (p === 'xlink:href') {
            el.setAttributeNS(XLINKNS, p, val)
          } else if (/^xmlns($|:)/i.test(p)) {
            // skip xmlns definitions
          } else {
            el.setAttributeNS(null, p, val)
          }
        } else {
          el.setAttribute(p, val)
        }
      }
    }
  }

  appendChild(el, children)
  return el
}

module.exports = hyperx(belCreateElement, {comments: true})
module.exports.default = module.exports
module.exports.createElement = belCreateElement

},{"./appendChild":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/bel/appendChild.js","hyperx":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hyperx/index.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/bitfield-rle/index.js":[function(require,module,exports){
var varint = require('varint')
var alloc = require('buffer-alloc-unsafe')

module.exports = align(1)

function align (n) {
  var exports = {}

  exports.align = align

  exports.encode = encode
  exports.encode.bytes = 0
  exports.encodingLength = encodingLength

  exports.decode = decode
  exports.decode.bytes = 0
  exports.decodingLength = decodingLength

  return exports

  function State (input, output, offset) {
    this.inputOffset = 0
    this.inputLength = input.length
    this.input = input
    this.outputOffset = offset
    this.output = output
  }

  function encode (bitfield, buffer, offset) {
    if (!offset) offset = 0
    if (!buffer) buffer = alloc(encodingLength(bitfield))
    var state = new State(bitfield, buffer, offset)
    rle(state)
    encode.bytes = state.outputOffset - offset
    return buffer
  }

  function encodingLength (bitfield) {
    var state = new State(bitfield, null, 0)
    rle(state)
    return state.outputOffset
  }

  function decode (buffer, offset) {
    if (!offset) offset = 0

    var bitfield = alloc(decodingLength(buffer, offset))
    var ptr = 0

    while (offset < buffer.length) {
      var next = varint.decode(buffer, offset)
      var repeat = next & 1
      var len = repeat ? (next - (next & 3)) / 4 : next / 2

      offset += varint.decode.bytes

      if (repeat) {
        bitfield.fill(next & 2 ? 255 : 0, ptr, ptr + len)
      } else {
        buffer.copy(bitfield, ptr, offset, offset + len)
        offset += len
      }

      ptr += len
    }

    bitfield.fill(0, ptr)
    decode.bytes = buffer.length - offset

    return bitfield
  }

  function decodingLength (buffer, offset) {
    if (!offset) offset = 0

    var len = 0

    while (offset < buffer.length) {
      var next = varint.decode(buffer, offset)
      offset += varint.decode.bytes

      var repeat = next & 1
      var slice = repeat ? (next - (next & 3)) / 4 : next / 2

      len += slice
      if (!repeat) offset += slice
    }

    if (offset > buffer.length) throw new Error('Invalid RLE bitfield')

    if (len & (n - 1)) return len + (n - (len & (n - 1)))

    return len
  }

  function rle (state) {
    var len = 0
    var bits = 0
    var input = state.input

    while (state.inputLength > 0 && !input[state.inputLength - 1]) state.inputLength--

    for (var i = 0; i < state.inputLength; i++) {
      if (input[i] === bits) {
        len++
        continue
      }

      if (len) encodeUpdate(state, i, len, bits)

      if (input[i] === 0 || input[i] === 255) {
        bits = input[i]
        len = 1
      } else {
        len = 0
      }
    }

    if (len) encodeUpdate(state, state.inputLength, len, bits)
    encodeFinal(state)
  }

  function encodeHead (state, end) {
    var headLength = end - state.inputOffset
    varint.encode(2 * headLength, state.output, state.outputOffset)
    state.outputOffset += varint.encode.bytes
    state.input.copy(state.output, state.outputOffset, state.inputOffset, end)
    state.outputOffset += headLength
  }

  function encodeFinal (state) {
    var headLength = state.inputLength - state.inputOffset
    if (!headLength) return

    if (!state.output) {
      state.outputOffset += (headLength + varint.encodingLength(2 * headLength))
    } else {
      encodeHead(state, state.inputLength)
    }

    state.inputOffset = state.inputLength
  }

  function encodeUpdate (state, i, len, bit) {
    var headLength = i - len - state.inputOffset
    var headCost = (headLength ? varint.encodingLength(2 * headLength) + headLength : 0)
    var enc = 4 * len + (bit ? 2 : 0) + 1 // len << 2 | bit << 1 | 1
    var encCost = headCost + varint.encodingLength(enc)
    var baseCost = varint.encodingLength(2 * (i - state.inputOffset)) + i - state.inputOffset

    if (encCost >= baseCost) return

    if (!state.output) {
      state.outputOffset += encCost
      state.inputOffset = i
      return
    }

    if (headLength) encodeHead(state, i - len)

    varint.encode(enc, state.output, state.outputOffset)
    state.outputOffset += varint.encode.bytes
    state.inputOffset = i
  }
}

},{"buffer-alloc-unsafe":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/buffer-alloc-unsafe/index.js","varint":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/varint/index.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/blake2b-wasm/blake2b.js":[function(require,module,exports){

module.exports = loadWebAssembly

loadWebAssembly.supported = typeof WebAssembly !== 'undefined'

function loadWebAssembly (opts) {
  if (!loadWebAssembly.supported) return null

  var imp = opts && opts.imports
  var wasm = toUint8Array('AGFzbQEAAAABEANgAn9/AGADf39/AGABfwADBQQAAQICBQUBAQroBwdNBQZtZW1vcnkCAAxibGFrZTJiX2luaXQAAA5ibGFrZTJiX3VwZGF0ZQABDWJsYWtlMmJfZmluYWwAAhBibGFrZTJiX2NvbXByZXNzAAMK00AElgMAIABCADcDACAAQQhqQgA3AwAgAEEQakIANwMAIABBGGpCADcDACAAQSBqQgA3AwAgAEEoakIANwMAIABBMGpCADcDACAAQThqQgA3AwAgAEHAAGpCADcDACAAQcgAakIANwMAIABB0ABqQgA3AwAgAEHYAGpCADcDACAAQeAAakIANwMAIABB6ABqQgA3AwAgAEHwAGpCADcDACAAQfgAakIANwMAIABBgAFqQoiS853/zPmE6gBBACkDAIU3AwAgAEGIAWpCu86qptjQ67O7f0EIKQMAhTcDACAAQZABakKr8NP0r+68tzxBECkDAIU3AwAgAEGYAWpC8e30+KWn/aelf0EYKQMAhTcDACAAQaABakLRhZrv+s+Uh9EAQSApAwCFNwMAIABBqAFqQp/Y+dnCkdqCm39BKCkDAIU3AwAgAEGwAWpC6/qG2r+19sEfQTApAwCFNwMAIABBuAFqQvnC+JuRo7Pw2wBBOCkDAIU3AwAgAEHAAWpCADcDACAAQcgBakIANwMAIABB0AFqQgA3AwALbQEDfyAAQcABaiEDIABByAFqIQQgBCkDAKchBQJAA0AgASACRg0BIAVBgAFGBEAgAyADKQMAIAWtfDcDAEEAIQUgABADCyAAIAVqIAEtAAA6AAAgBUEBaiEFIAFBAWohAQwACwsgBCAFrTcDAAtkAQN/IABBwAFqIQEgAEHIAWohAiABIAEpAwAgAikDAHw3AwAgAEHQAWpCfzcDACACKQMApyEDAkADQCADQYABRg0BIAAgA2pBADoAACADQQFqIQMMAAsLIAIgA603AwAgABADC+U7AiB+CX8gAEGAAWohISAAQYgBaiEiIABBkAFqISMgAEGYAWohJCAAQaABaiElIABBqAFqISYgAEGwAWohJyAAQbgBaiEoICEpAwAhASAiKQMAIQIgIykDACEDICQpAwAhBCAlKQMAIQUgJikDACEGICcpAwAhByAoKQMAIQhCiJLznf/M+YTqACEJQrvOqqbY0Ouzu38hCkKr8NP0r+68tzwhC0Lx7fT4paf9p6V/IQxC0YWa7/rPlIfRACENQp/Y+dnCkdqCm38hDkLr+obav7X2wR8hD0L5wvibkaOz8NsAIRAgACkDACERIABBCGopAwAhEiAAQRBqKQMAIRMgAEEYaikDACEUIABBIGopAwAhFSAAQShqKQMAIRYgAEEwaikDACEXIABBOGopAwAhGCAAQcAAaikDACEZIABByABqKQMAIRogAEHQAGopAwAhGyAAQdgAaikDACEcIABB4ABqKQMAIR0gAEHoAGopAwAhHiAAQfAAaikDACEfIABB+ABqKQMAISAgDSAAQcABaikDAIUhDSAPIABB0AFqKQMAhSEPIAEgBSARfHwhASANIAGFQiCKIQ0gCSANfCEJIAUgCYVCGIohBSABIAUgEnx8IQEgDSABhUIQiiENIAkgDXwhCSAFIAmFQj+KIQUgAiAGIBN8fCECIA4gAoVCIIohDiAKIA58IQogBiAKhUIYiiEGIAIgBiAUfHwhAiAOIAKFQhCKIQ4gCiAOfCEKIAYgCoVCP4ohBiADIAcgFXx8IQMgDyADhUIgiiEPIAsgD3whCyAHIAuFQhiKIQcgAyAHIBZ8fCEDIA8gA4VCEIohDyALIA98IQsgByALhUI/iiEHIAQgCCAXfHwhBCAQIASFQiCKIRAgDCAQfCEMIAggDIVCGIohCCAEIAggGHx8IQQgECAEhUIQiiEQIAwgEHwhDCAIIAyFQj+KIQggASAGIBl8fCEBIBAgAYVCIIohECALIBB8IQsgBiALhUIYiiEGIAEgBiAafHwhASAQIAGFQhCKIRAgCyAQfCELIAYgC4VCP4ohBiACIAcgG3x8IQIgDSAChUIgiiENIAwgDXwhDCAHIAyFQhiKIQcgAiAHIBx8fCECIA0gAoVCEIohDSAMIA18IQwgByAMhUI/iiEHIAMgCCAdfHwhAyAOIAOFQiCKIQ4gCSAOfCEJIAggCYVCGIohCCADIAggHnx8IQMgDiADhUIQiiEOIAkgDnwhCSAIIAmFQj+KIQggBCAFIB98fCEEIA8gBIVCIIohDyAKIA98IQogBSAKhUIYiiEFIAQgBSAgfHwhBCAPIASFQhCKIQ8gCiAPfCEKIAUgCoVCP4ohBSABIAUgH3x8IQEgDSABhUIgiiENIAkgDXwhCSAFIAmFQhiKIQUgASAFIBt8fCEBIA0gAYVCEIohDSAJIA18IQkgBSAJhUI/iiEFIAIgBiAVfHwhAiAOIAKFQiCKIQ4gCiAOfCEKIAYgCoVCGIohBiACIAYgGXx8IQIgDiAChUIQiiEOIAogDnwhCiAGIAqFQj+KIQYgAyAHIBp8fCEDIA8gA4VCIIohDyALIA98IQsgByALhUIYiiEHIAMgByAgfHwhAyAPIAOFQhCKIQ8gCyAPfCELIAcgC4VCP4ohByAEIAggHnx8IQQgECAEhUIgiiEQIAwgEHwhDCAIIAyFQhiKIQggBCAIIBd8fCEEIBAgBIVCEIohECAMIBB8IQwgCCAMhUI/iiEIIAEgBiASfHwhASAQIAGFQiCKIRAgCyAQfCELIAYgC4VCGIohBiABIAYgHXx8IQEgECABhUIQiiEQIAsgEHwhCyAGIAuFQj+KIQYgAiAHIBF8fCECIA0gAoVCIIohDSAMIA18IQwgByAMhUIYiiEHIAIgByATfHwhAiANIAKFQhCKIQ0gDCANfCEMIAcgDIVCP4ohByADIAggHHx8IQMgDiADhUIgiiEOIAkgDnwhCSAIIAmFQhiKIQggAyAIIBh8fCEDIA4gA4VCEIohDiAJIA58IQkgCCAJhUI/iiEIIAQgBSAWfHwhBCAPIASFQiCKIQ8gCiAPfCEKIAUgCoVCGIohBSAEIAUgFHx8IQQgDyAEhUIQiiEPIAogD3whCiAFIAqFQj+KIQUgASAFIBx8fCEBIA0gAYVCIIohDSAJIA18IQkgBSAJhUIYiiEFIAEgBSAZfHwhASANIAGFQhCKIQ0gCSANfCEJIAUgCYVCP4ohBSACIAYgHXx8IQIgDiAChUIgiiEOIAogDnwhCiAGIAqFQhiKIQYgAiAGIBF8fCECIA4gAoVCEIohDiAKIA58IQogBiAKhUI/iiEGIAMgByAWfHwhAyAPIAOFQiCKIQ8gCyAPfCELIAcgC4VCGIohByADIAcgE3x8IQMgDyADhUIQiiEPIAsgD3whCyAHIAuFQj+KIQcgBCAIICB8fCEEIBAgBIVCIIohECAMIBB8IQwgCCAMhUIYiiEIIAQgCCAefHwhBCAQIASFQhCKIRAgDCAQfCEMIAggDIVCP4ohCCABIAYgG3x8IQEgECABhUIgiiEQIAsgEHwhCyAGIAuFQhiKIQYgASAGIB98fCEBIBAgAYVCEIohECALIBB8IQsgBiALhUI/iiEGIAIgByAUfHwhAiANIAKFQiCKIQ0gDCANfCEMIAcgDIVCGIohByACIAcgF3x8IQIgDSAChUIQiiENIAwgDXwhDCAHIAyFQj+KIQcgAyAIIBh8fCEDIA4gA4VCIIohDiAJIA58IQkgCCAJhUIYiiEIIAMgCCASfHwhAyAOIAOFQhCKIQ4gCSAOfCEJIAggCYVCP4ohCCAEIAUgGnx8IQQgDyAEhUIgiiEPIAogD3whCiAFIAqFQhiKIQUgBCAFIBV8fCEEIA8gBIVCEIohDyAKIA98IQogBSAKhUI/iiEFIAEgBSAYfHwhASANIAGFQiCKIQ0gCSANfCEJIAUgCYVCGIohBSABIAUgGnx8IQEgDSABhUIQiiENIAkgDXwhCSAFIAmFQj+KIQUgAiAGIBR8fCECIA4gAoVCIIohDiAKIA58IQogBiAKhUIYiiEGIAIgBiASfHwhAiAOIAKFQhCKIQ4gCiAOfCEKIAYgCoVCP4ohBiADIAcgHnx8IQMgDyADhUIgiiEPIAsgD3whCyAHIAuFQhiKIQcgAyAHIB18fCEDIA8gA4VCEIohDyALIA98IQsgByALhUI/iiEHIAQgCCAcfHwhBCAQIASFQiCKIRAgDCAQfCEMIAggDIVCGIohCCAEIAggH3x8IQQgECAEhUIQiiEQIAwgEHwhDCAIIAyFQj+KIQggASAGIBN8fCEBIBAgAYVCIIohECALIBB8IQsgBiALhUIYiiEGIAEgBiAXfHwhASAQIAGFQhCKIRAgCyAQfCELIAYgC4VCP4ohBiACIAcgFnx8IQIgDSAChUIgiiENIAwgDXwhDCAHIAyFQhiKIQcgAiAHIBt8fCECIA0gAoVCEIohDSAMIA18IQwgByAMhUI/iiEHIAMgCCAVfHwhAyAOIAOFQiCKIQ4gCSAOfCEJIAggCYVCGIohCCADIAggEXx8IQMgDiADhUIQiiEOIAkgDnwhCSAIIAmFQj+KIQggBCAFICB8fCEEIA8gBIVCIIohDyAKIA98IQogBSAKhUIYiiEFIAQgBSAZfHwhBCAPIASFQhCKIQ8gCiAPfCEKIAUgCoVCP4ohBSABIAUgGnx8IQEgDSABhUIgiiENIAkgDXwhCSAFIAmFQhiKIQUgASAFIBF8fCEBIA0gAYVCEIohDSAJIA18IQkgBSAJhUI/iiEFIAIgBiAWfHwhAiAOIAKFQiCKIQ4gCiAOfCEKIAYgCoVCGIohBiACIAYgGHx8IQIgDiAChUIQiiEOIAogDnwhCiAGIAqFQj+KIQYgAyAHIBN8fCEDIA8gA4VCIIohDyALIA98IQsgByALhUIYiiEHIAMgByAVfHwhAyAPIAOFQhCKIQ8gCyAPfCELIAcgC4VCP4ohByAEIAggG3x8IQQgECAEhUIgiiEQIAwgEHwhDCAIIAyFQhiKIQggBCAIICB8fCEEIBAgBIVCEIohECAMIBB8IQwgCCAMhUI/iiEIIAEgBiAffHwhASAQIAGFQiCKIRAgCyAQfCELIAYgC4VCGIohBiABIAYgEnx8IQEgECABhUIQiiEQIAsgEHwhCyAGIAuFQj+KIQYgAiAHIBx8fCECIA0gAoVCIIohDSAMIA18IQwgByAMhUIYiiEHIAIgByAdfHwhAiANIAKFQhCKIQ0gDCANfCEMIAcgDIVCP4ohByADIAggF3x8IQMgDiADhUIgiiEOIAkgDnwhCSAIIAmFQhiKIQggAyAIIBl8fCEDIA4gA4VCEIohDiAJIA58IQkgCCAJhUI/iiEIIAQgBSAUfHwhBCAPIASFQiCKIQ8gCiAPfCEKIAUgCoVCGIohBSAEIAUgHnx8IQQgDyAEhUIQiiEPIAogD3whCiAFIAqFQj+KIQUgASAFIBN8fCEBIA0gAYVCIIohDSAJIA18IQkgBSAJhUIYiiEFIAEgBSAdfHwhASANIAGFQhCKIQ0gCSANfCEJIAUgCYVCP4ohBSACIAYgF3x8IQIgDiAChUIgiiEOIAogDnwhCiAGIAqFQhiKIQYgAiAGIBt8fCECIA4gAoVCEIohDiAKIA58IQogBiAKhUI/iiEGIAMgByARfHwhAyAPIAOFQiCKIQ8gCyAPfCELIAcgC4VCGIohByADIAcgHHx8IQMgDyADhUIQiiEPIAsgD3whCyAHIAuFQj+KIQcgBCAIIBl8fCEEIBAgBIVCIIohECAMIBB8IQwgCCAMhUIYiiEIIAQgCCAUfHwhBCAQIASFQhCKIRAgDCAQfCEMIAggDIVCP4ohCCABIAYgFXx8IQEgECABhUIgiiEQIAsgEHwhCyAGIAuFQhiKIQYgASAGIB58fCEBIBAgAYVCEIohECALIBB8IQsgBiALhUI/iiEGIAIgByAYfHwhAiANIAKFQiCKIQ0gDCANfCEMIAcgDIVCGIohByACIAcgFnx8IQIgDSAChUIQiiENIAwgDXwhDCAHIAyFQj+KIQcgAyAIICB8fCEDIA4gA4VCIIohDiAJIA58IQkgCCAJhUIYiiEIIAMgCCAffHwhAyAOIAOFQhCKIQ4gCSAOfCEJIAggCYVCP4ohCCAEIAUgEnx8IQQgDyAEhUIgiiEPIAogD3whCiAFIAqFQhiKIQUgBCAFIBp8fCEEIA8gBIVCEIohDyAKIA98IQogBSAKhUI/iiEFIAEgBSAdfHwhASANIAGFQiCKIQ0gCSANfCEJIAUgCYVCGIohBSABIAUgFnx8IQEgDSABhUIQiiENIAkgDXwhCSAFIAmFQj+KIQUgAiAGIBJ8fCECIA4gAoVCIIohDiAKIA58IQogBiAKhUIYiiEGIAIgBiAgfHwhAiAOIAKFQhCKIQ4gCiAOfCEKIAYgCoVCP4ohBiADIAcgH3x8IQMgDyADhUIgiiEPIAsgD3whCyAHIAuFQhiKIQcgAyAHIB58fCEDIA8gA4VCEIohDyALIA98IQsgByALhUI/iiEHIAQgCCAVfHwhBCAQIASFQiCKIRAgDCAQfCEMIAggDIVCGIohCCAEIAggG3x8IQQgECAEhUIQiiEQIAwgEHwhDCAIIAyFQj+KIQggASAGIBF8fCEBIBAgAYVCIIohECALIBB8IQsgBiALhUIYiiEGIAEgBiAYfHwhASAQIAGFQhCKIRAgCyAQfCELIAYgC4VCP4ohBiACIAcgF3x8IQIgDSAChUIgiiENIAwgDXwhDCAHIAyFQhiKIQcgAiAHIBR8fCECIA0gAoVCEIohDSAMIA18IQwgByAMhUI/iiEHIAMgCCAafHwhAyAOIAOFQiCKIQ4gCSAOfCEJIAggCYVCGIohCCADIAggE3x8IQMgDiADhUIQiiEOIAkgDnwhCSAIIAmFQj+KIQggBCAFIBl8fCEEIA8gBIVCIIohDyAKIA98IQogBSAKhUIYiiEFIAQgBSAcfHwhBCAPIASFQhCKIQ8gCiAPfCEKIAUgCoVCP4ohBSABIAUgHnx8IQEgDSABhUIgiiENIAkgDXwhCSAFIAmFQhiKIQUgASAFIBx8fCEBIA0gAYVCEIohDSAJIA18IQkgBSAJhUI/iiEFIAIgBiAYfHwhAiAOIAKFQiCKIQ4gCiAOfCEKIAYgCoVCGIohBiACIAYgH3x8IQIgDiAChUIQiiEOIAogDnwhCiAGIAqFQj+KIQYgAyAHIB18fCEDIA8gA4VCIIohDyALIA98IQsgByALhUIYiiEHIAMgByASfHwhAyAPIAOFQhCKIQ8gCyAPfCELIAcgC4VCP4ohByAEIAggFHx8IQQgECAEhUIgiiEQIAwgEHwhDCAIIAyFQhiKIQggBCAIIBp8fCEEIBAgBIVCEIohECAMIBB8IQwgCCAMhUI/iiEIIAEgBiAWfHwhASAQIAGFQiCKIRAgCyAQfCELIAYgC4VCGIohBiABIAYgEXx8IQEgECABhUIQiiEQIAsgEHwhCyAGIAuFQj+KIQYgAiAHICB8fCECIA0gAoVCIIohDSAMIA18IQwgByAMhUIYiiEHIAIgByAVfHwhAiANIAKFQhCKIQ0gDCANfCEMIAcgDIVCP4ohByADIAggGXx8IQMgDiADhUIgiiEOIAkgDnwhCSAIIAmFQhiKIQggAyAIIBd8fCEDIA4gA4VCEIohDiAJIA58IQkgCCAJhUI/iiEIIAQgBSATfHwhBCAPIASFQiCKIQ8gCiAPfCEKIAUgCoVCGIohBSAEIAUgG3x8IQQgDyAEhUIQiiEPIAogD3whCiAFIAqFQj+KIQUgASAFIBd8fCEBIA0gAYVCIIohDSAJIA18IQkgBSAJhUIYiiEFIAEgBSAgfHwhASANIAGFQhCKIQ0gCSANfCEJIAUgCYVCP4ohBSACIAYgH3x8IQIgDiAChUIgiiEOIAogDnwhCiAGIAqFQhiKIQYgAiAGIBp8fCECIA4gAoVCEIohDiAKIA58IQogBiAKhUI/iiEGIAMgByAcfHwhAyAPIAOFQiCKIQ8gCyAPfCELIAcgC4VCGIohByADIAcgFHx8IQMgDyADhUIQiiEPIAsgD3whCyAHIAuFQj+KIQcgBCAIIBF8fCEEIBAgBIVCIIohECAMIBB8IQwgCCAMhUIYiiEIIAQgCCAZfHwhBCAQIASFQhCKIRAgDCAQfCEMIAggDIVCP4ohCCABIAYgHXx8IQEgECABhUIgiiEQIAsgEHwhCyAGIAuFQhiKIQYgASAGIBN8fCEBIBAgAYVCEIohECALIBB8IQsgBiALhUI/iiEGIAIgByAefHwhAiANIAKFQiCKIQ0gDCANfCEMIAcgDIVCGIohByACIAcgGHx8IQIgDSAChUIQiiENIAwgDXwhDCAHIAyFQj+KIQcgAyAIIBJ8fCEDIA4gA4VCIIohDiAJIA58IQkgCCAJhUIYiiEIIAMgCCAVfHwhAyAOIAOFQhCKIQ4gCSAOfCEJIAggCYVCP4ohCCAEIAUgG3x8IQQgDyAEhUIgiiEPIAogD3whCiAFIAqFQhiKIQUgBCAFIBZ8fCEEIA8gBIVCEIohDyAKIA98IQogBSAKhUI/iiEFIAEgBSAbfHwhASANIAGFQiCKIQ0gCSANfCEJIAUgCYVCGIohBSABIAUgE3x8IQEgDSABhUIQiiENIAkgDXwhCSAFIAmFQj+KIQUgAiAGIBl8fCECIA4gAoVCIIohDiAKIA58IQogBiAKhUIYiiEGIAIgBiAVfHwhAiAOIAKFQhCKIQ4gCiAOfCEKIAYgCoVCP4ohBiADIAcgGHx8IQMgDyADhUIgiiEPIAsgD3whCyAHIAuFQhiKIQcgAyAHIBd8fCEDIA8gA4VCEIohDyALIA98IQsgByALhUI/iiEHIAQgCCASfHwhBCAQIASFQiCKIRAgDCAQfCEMIAggDIVCGIohCCAEIAggFnx8IQQgECAEhUIQiiEQIAwgEHwhDCAIIAyFQj+KIQggASAGICB8fCEBIBAgAYVCIIohECALIBB8IQsgBiALhUIYiiEGIAEgBiAcfHwhASAQIAGFQhCKIRAgCyAQfCELIAYgC4VCP4ohBiACIAcgGnx8IQIgDSAChUIgiiENIAwgDXwhDCAHIAyFQhiKIQcgAiAHIB98fCECIA0gAoVCEIohDSAMIA18IQwgByAMhUI/iiEHIAMgCCAUfHwhAyAOIAOFQiCKIQ4gCSAOfCEJIAggCYVCGIohCCADIAggHXx8IQMgDiADhUIQiiEOIAkgDnwhCSAIIAmFQj+KIQggBCAFIB58fCEEIA8gBIVCIIohDyAKIA98IQogBSAKhUIYiiEFIAQgBSARfHwhBCAPIASFQhCKIQ8gCiAPfCEKIAUgCoVCP4ohBSABIAUgEXx8IQEgDSABhUIgiiENIAkgDXwhCSAFIAmFQhiKIQUgASAFIBJ8fCEBIA0gAYVCEIohDSAJIA18IQkgBSAJhUI/iiEFIAIgBiATfHwhAiAOIAKFQiCKIQ4gCiAOfCEKIAYgCoVCGIohBiACIAYgFHx8IQIgDiAChUIQiiEOIAogDnwhCiAGIAqFQj+KIQYgAyAHIBV8fCEDIA8gA4VCIIohDyALIA98IQsgByALhUIYiiEHIAMgByAWfHwhAyAPIAOFQhCKIQ8gCyAPfCELIAcgC4VCP4ohByAEIAggF3x8IQQgECAEhUIgiiEQIAwgEHwhDCAIIAyFQhiKIQggBCAIIBh8fCEEIBAgBIVCEIohECAMIBB8IQwgCCAMhUI/iiEIIAEgBiAZfHwhASAQIAGFQiCKIRAgCyAQfCELIAYgC4VCGIohBiABIAYgGnx8IQEgECABhUIQiiEQIAsgEHwhCyAGIAuFQj+KIQYgAiAHIBt8fCECIA0gAoVCIIohDSAMIA18IQwgByAMhUIYiiEHIAIgByAcfHwhAiANIAKFQhCKIQ0gDCANfCEMIAcgDIVCP4ohByADIAggHXx8IQMgDiADhUIgiiEOIAkgDnwhCSAIIAmFQhiKIQggAyAIIB58fCEDIA4gA4VCEIohDiAJIA58IQkgCCAJhUI/iiEIIAQgBSAffHwhBCAPIASFQiCKIQ8gCiAPfCEKIAUgCoVCGIohBSAEIAUgIHx8IQQgDyAEhUIQiiEPIAogD3whCiAFIAqFQj+KIQUgASAFIB98fCEBIA0gAYVCIIohDSAJIA18IQkgBSAJhUIYiiEFIAEgBSAbfHwhASANIAGFQhCKIQ0gCSANfCEJIAUgCYVCP4ohBSACIAYgFXx8IQIgDiAChUIgiiEOIAogDnwhCiAGIAqFQhiKIQYgAiAGIBl8fCECIA4gAoVCEIohDiAKIA58IQogBiAKhUI/iiEGIAMgByAafHwhAyAPIAOFQiCKIQ8gCyAPfCELIAcgC4VCGIohByADIAcgIHx8IQMgDyADhUIQiiEPIAsgD3whCyAHIAuFQj+KIQcgBCAIIB58fCEEIBAgBIVCIIohECAMIBB8IQwgCCAMhUIYiiEIIAQgCCAXfHwhBCAQIASFQhCKIRAgDCAQfCEMIAggDIVCP4ohCCABIAYgEnx8IQEgECABhUIgiiEQIAsgEHwhCyAGIAuFQhiKIQYgASAGIB18fCEBIBAgAYVCEIohECALIBB8IQsgBiALhUI/iiEGIAIgByARfHwhAiANIAKFQiCKIQ0gDCANfCEMIAcgDIVCGIohByACIAcgE3x8IQIgDSAChUIQiiENIAwgDXwhDCAHIAyFQj+KIQcgAyAIIBx8fCEDIA4gA4VCIIohDiAJIA58IQkgCCAJhUIYiiEIIAMgCCAYfHwhAyAOIAOFQhCKIQ4gCSAOfCEJIAggCYVCP4ohCCAEIAUgFnx8IQQgDyAEhUIgiiEPIAogD3whCiAFIAqFQhiKIQUgBCAFIBR8fCEEIA8gBIVCEIohDyAKIA98IQogBSAKhUI/iiEFICEgISkDACABIAmFhTcDACAiICIpAwAgAiAKhYU3AwAgIyAjKQMAIAMgC4WFNwMAICQgJCkDACAEIAyFhTcDACAlICUpAwAgBSANhYU3AwAgJiAmKQMAIAYgDoWFNwMAICcgJykDACAHIA+FhTcDACAoICgpAwAgCCAQhYU3AwAL')
  var ready = null

  var mod = {
    buffer: wasm,
    memory: null,
    exports: null,
    realloc: realloc,
    onload: onload
  }

  onload(function () {})

  return mod

  function realloc (size) {
    mod.exports.memory.grow(Math.ceil(Math.abs(size - mod.memory.length) / 65536))
    mod.memory = new Uint8Array(mod.exports.memory.buffer)
  }

  function onload (cb) {
    if (mod.exports) return cb()

    if (ready) {
      ready.then(cb.bind(null, null)).catch(cb)
      return
    }

    try {
      if (opts && opts.async) throw new Error('async')
      setup({instance: new WebAssembly.Instance(new WebAssembly.Module(wasm), imp)})
    } catch (err) {
      ready = WebAssembly.instantiate(wasm, imp).then(setup)
    }

    onload(cb)
  }

  function setup (w) {
    mod.exports = w.instance.exports
    mod.memory = mod.exports.memory && mod.exports.memory.buffer && new Uint8Array(mod.exports.memory.buffer)
  }
}

function toUint8Array (s) {
  if (typeof atob === 'function') return new Uint8Array(atob(s).split('').map(charCodeAt))
  return new (require('buf' + 'fer').Buffer)(s, 'base64')
}

function charCodeAt (c) {
  return c.charCodeAt(0)
}

},{}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/blake2b-wasm/index.js":[function(require,module,exports){
var assert = require('nanoassert')
var wasm = require('./blake2b')()

var head = 64
var freeList = []

module.exports = Blake2b
var BYTES_MIN = module.exports.BYTES_MIN = 16
var BYTES_MAX = module.exports.BYTES_MAX = 64
var BYTES = module.exports.BYTES = 32
var KEYBYTES_MIN = module.exports.KEYBYTES_MIN = 16
var KEYBYTES_MAX = module.exports.KEYBYTES_MAX = 64
var KEYBYTES = module.exports.KEYBYTES = 32
var SALTBYTES = module.exports.SALTBYTES = 16
var PERSONALBYTES = module.exports.PERSONALBYTES = 16

function Blake2b (digestLength, key, salt, personal, noAssert) {
  if (!(this instanceof Blake2b)) return new Blake2b(digestLength, key, salt, personal, noAssert)
  if (!(wasm && wasm.exports)) throw new Error('WASM not loaded. Wait for Blake2b.ready(cb)')
  if (!digestLength) digestLength = 32

  if (noAssert !== true) {
    assert(digestLength >= BYTES_MIN, 'digestLength must be at least ' + BYTES_MIN + ', was given ' + digestLength)
    assert(digestLength <= BYTES_MAX, 'digestLength must be at most ' + BYTES_MAX + ', was given ' + digestLength)
    if (key != null) assert(key.length >= KEYBYTES_MIN, 'key must be at least ' + KEYBYTES_MIN + ', was given ' + key.length)
    if (key != null) assert(key.length <= KEYBYTES_MAX, 'key must be at least ' + KEYBYTES_MAX + ', was given ' + key.length)
    if (salt != null) assert(salt.length === SALTBYTES, 'salt must be exactly ' + SALTBYTES + ', was given ' + salt.length)
    if (personal != null) assert(personal.length === PERSONALBYTES, 'personal must be exactly ' + PERSONALBYTES + ', was given ' + personal.length)
  }

  if (!freeList.length) {
    freeList.push(head)
    head += 216
  }

  this.digestLength = digestLength
  this.finalized = false
  this.pointer = freeList.pop()

  wasm.memory.fill(0, 0, 64)
  wasm.memory[0] = this.digestLength
  wasm.memory[1] = key ? key.length : 0
  wasm.memory[2] = 1 // fanout
  wasm.memory[3] = 1 // depth

  if (salt) wasm.memory.set(salt, 32)
  if (personal) wasm.memory.set(personal, 48)

  if (this.pointer + 216 > wasm.memory.length) wasm.realloc(this.pointer + 216) // we need 216 bytes for the state
  wasm.exports.blake2b_init(this.pointer, this.digestLength)

  if (key) {
    this.update(key)
    wasm.memory.fill(0, head, head + key.length) // whiteout key
    wasm.memory[this.pointer + 200] = 128
  }
}


Blake2b.prototype.update = function (input) {
  assert(this.finalized === false, 'Hash instance finalized')
  assert(input, 'input must be TypedArray or Buffer')

  if (head + input.length > wasm.memory.length) wasm.realloc(head + input.length)
  wasm.memory.set(input, head)
  wasm.exports.blake2b_update(this.pointer, head, head + input.length)
  return this
}

Blake2b.prototype.digest = function (enc) {
  assert(this.finalized === false, 'Hash instance finalized')
  this.finalized = true

  freeList.push(this.pointer)
  wasm.exports.blake2b_final(this.pointer)

  if (!enc || enc === 'binary') {
    return wasm.memory.slice(this.pointer + 128, this.pointer + 128 + this.digestLength)
  }

  if (enc === 'hex') {
    return hexSlice(wasm.memory, this.pointer + 128, this.digestLength)
  }

  assert(enc.length >= this.digestLength, 'input must be TypedArray or Buffer')
  for (var i = 0; i < this.digestLength; i++) {
    enc[i] = wasm.memory[this.pointer + 128 + i]
  }

  return enc
}

// libsodium compat
Blake2b.prototype.final = Blake2b.prototype.digest

Blake2b.WASM = wasm && wasm.buffer
Blake2b.SUPPORTED = typeof WebAssembly !== 'undefined'

Blake2b.ready = function (cb) {
  if (!cb) cb = noop
  if (!wasm) return cb(new Error('WebAssembly not supported'))

  // backwards compat, can be removed in a new major
  var p = new Promise(function (reject, resolve) {
    wasm.onload(function (err) {
      if (err) resolve()
      else reject()
      cb(err)
    })
  })

  return p
}

Blake2b.prototype.ready = Blake2b.ready

function noop () {}

function hexSlice (buf, start, len) {
  var str = ''
  for (var i = 0; i < len; i++) str += toHex(buf[start + i])
  return str
}

function toHex (n) {
  if (n < 16) return '0' + n.toString(16)
  return n.toString(16)
}

},{"./blake2b":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/blake2b-wasm/blake2b.js","nanoassert":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/nanoassert/index.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/blake2b/index.js":[function(require,module,exports){
var assert = require('nanoassert')
var b2wasm = require('blake2b-wasm')

// 64-bit unsigned addition
// Sets v[a,a+1] += v[b,b+1]
// v should be a Uint32Array
function ADD64AA (v, a, b) {
  var o0 = v[a] + v[b]
  var o1 = v[a + 1] + v[b + 1]
  if (o0 >= 0x100000000) {
    o1++
  }
  v[a] = o0
  v[a + 1] = o1
}

// 64-bit unsigned addition
// Sets v[a,a+1] += b
// b0 is the low 32 bits of b, b1 represents the high 32 bits
function ADD64AC (v, a, b0, b1) {
  var o0 = v[a] + b0
  if (b0 < 0) {
    o0 += 0x100000000
  }
  var o1 = v[a + 1] + b1
  if (o0 >= 0x100000000) {
    o1++
  }
  v[a] = o0
  v[a + 1] = o1
}

// Little-endian byte access
function B2B_GET32 (arr, i) {
  return (arr[i] ^
  (arr[i + 1] << 8) ^
  (arr[i + 2] << 16) ^
  (arr[i + 3] << 24))
}

// G Mixing function
// The ROTRs are inlined for speed
function B2B_G (a, b, c, d, ix, iy) {
  var x0 = m[ix]
  var x1 = m[ix + 1]
  var y0 = m[iy]
  var y1 = m[iy + 1]

  ADD64AA(v, a, b) // v[a,a+1] += v[b,b+1] ... in JS we must store a uint64 as two uint32s
  ADD64AC(v, a, x0, x1) // v[a, a+1] += x ... x0 is the low 32 bits of x, x1 is the high 32 bits

  // v[d,d+1] = (v[d,d+1] xor v[a,a+1]) rotated to the right by 32 bits
  var xor0 = v[d] ^ v[a]
  var xor1 = v[d + 1] ^ v[a + 1]
  v[d] = xor1
  v[d + 1] = xor0

  ADD64AA(v, c, d)

  // v[b,b+1] = (v[b,b+1] xor v[c,c+1]) rotated right by 24 bits
  xor0 = v[b] ^ v[c]
  xor1 = v[b + 1] ^ v[c + 1]
  v[b] = (xor0 >>> 24) ^ (xor1 << 8)
  v[b + 1] = (xor1 >>> 24) ^ (xor0 << 8)

  ADD64AA(v, a, b)
  ADD64AC(v, a, y0, y1)

  // v[d,d+1] = (v[d,d+1] xor v[a,a+1]) rotated right by 16 bits
  xor0 = v[d] ^ v[a]
  xor1 = v[d + 1] ^ v[a + 1]
  v[d] = (xor0 >>> 16) ^ (xor1 << 16)
  v[d + 1] = (xor1 >>> 16) ^ (xor0 << 16)

  ADD64AA(v, c, d)

  // v[b,b+1] = (v[b,b+1] xor v[c,c+1]) rotated right by 63 bits
  xor0 = v[b] ^ v[c]
  xor1 = v[b + 1] ^ v[c + 1]
  v[b] = (xor1 >>> 31) ^ (xor0 << 1)
  v[b + 1] = (xor0 >>> 31) ^ (xor1 << 1)
}

// Initialization Vector
var BLAKE2B_IV32 = new Uint32Array([
  0xF3BCC908, 0x6A09E667, 0x84CAA73B, 0xBB67AE85,
  0xFE94F82B, 0x3C6EF372, 0x5F1D36F1, 0xA54FF53A,
  0xADE682D1, 0x510E527F, 0x2B3E6C1F, 0x9B05688C,
  0xFB41BD6B, 0x1F83D9AB, 0x137E2179, 0x5BE0CD19
])

var SIGMA8 = [
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
  14, 10, 4, 8, 9, 15, 13, 6, 1, 12, 0, 2, 11, 7, 5, 3,
  11, 8, 12, 0, 5, 2, 15, 13, 10, 14, 3, 6, 7, 1, 9, 4,
  7, 9, 3, 1, 13, 12, 11, 14, 2, 6, 5, 10, 4, 0, 15, 8,
  9, 0, 5, 7, 2, 4, 10, 15, 14, 1, 11, 12, 6, 8, 3, 13,
  2, 12, 6, 10, 0, 11, 8, 3, 4, 13, 7, 5, 15, 14, 1, 9,
  12, 5, 1, 15, 14, 13, 4, 10, 0, 7, 6, 3, 9, 2, 8, 11,
  13, 11, 7, 14, 12, 1, 3, 9, 5, 0, 15, 4, 8, 6, 2, 10,
  6, 15, 14, 9, 11, 3, 0, 8, 12, 2, 13, 7, 1, 4, 10, 5,
  10, 2, 8, 4, 7, 6, 1, 5, 15, 11, 9, 14, 3, 12, 13, 0,
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
  14, 10, 4, 8, 9, 15, 13, 6, 1, 12, 0, 2, 11, 7, 5, 3
]

// These are offsets into a uint64 buffer.
// Multiply them all by 2 to make them offsets into a uint32 buffer,
// because this is Javascript and we don't have uint64s
var SIGMA82 = new Uint8Array(SIGMA8.map(function (x) { return x * 2 }))

// Compression function. 'last' flag indicates last block.
// Note we're representing 16 uint64s as 32 uint32s
var v = new Uint32Array(32)
var m = new Uint32Array(32)
function blake2bCompress (ctx, last) {
  var i = 0

  // init work variables
  for (i = 0; i < 16; i++) {
    v[i] = ctx.h[i]
    v[i + 16] = BLAKE2B_IV32[i]
  }

  // low 64 bits of offset
  v[24] = v[24] ^ ctx.t
  v[25] = v[25] ^ (ctx.t / 0x100000000)
  // high 64 bits not supported, offset may not be higher than 2**53-1

  // last block flag set ?
  if (last) {
    v[28] = ~v[28]
    v[29] = ~v[29]
  }

  // get little-endian words
  for (i = 0; i < 32; i++) {
    m[i] = B2B_GET32(ctx.b, 4 * i)
  }

  // twelve rounds of mixing
  for (i = 0; i < 12; i++) {
    B2B_G(0, 8, 16, 24, SIGMA82[i * 16 + 0], SIGMA82[i * 16 + 1])
    B2B_G(2, 10, 18, 26, SIGMA82[i * 16 + 2], SIGMA82[i * 16 + 3])
    B2B_G(4, 12, 20, 28, SIGMA82[i * 16 + 4], SIGMA82[i * 16 + 5])
    B2B_G(6, 14, 22, 30, SIGMA82[i * 16 + 6], SIGMA82[i * 16 + 7])
    B2B_G(0, 10, 20, 30, SIGMA82[i * 16 + 8], SIGMA82[i * 16 + 9])
    B2B_G(2, 12, 22, 24, SIGMA82[i * 16 + 10], SIGMA82[i * 16 + 11])
    B2B_G(4, 14, 16, 26, SIGMA82[i * 16 + 12], SIGMA82[i * 16 + 13])
    B2B_G(6, 8, 18, 28, SIGMA82[i * 16 + 14], SIGMA82[i * 16 + 15])
  }

  for (i = 0; i < 16; i++) {
    ctx.h[i] = ctx.h[i] ^ v[i] ^ v[i + 16]
  }
}

// reusable parameter_block
var parameter_block = new Uint8Array([
  0, 0, 0, 0,      //  0: outlen, keylen, fanout, depth
  0, 0, 0, 0,      //  4: leaf length, sequential mode
  0, 0, 0, 0,      //  8: node offset
  0, 0, 0, 0,      // 12: node offset
  0, 0, 0, 0,      // 16: node depth, inner length, rfu
  0, 0, 0, 0,      // 20: rfu
  0, 0, 0, 0,      // 24: rfu
  0, 0, 0, 0,      // 28: rfu
  0, 0, 0, 0,      // 32: salt
  0, 0, 0, 0,      // 36: salt
  0, 0, 0, 0,      // 40: salt
  0, 0, 0, 0,      // 44: salt
  0, 0, 0, 0,      // 48: personal
  0, 0, 0, 0,      // 52: personal
  0, 0, 0, 0,      // 56: personal
  0, 0, 0, 0       // 60: personal
])

// Creates a BLAKE2b hashing context
// Requires an output length between 1 and 64 bytes
// Takes an optional Uint8Array key
function Blake2b (outlen, key, salt, personal) {
  // zero out parameter_block before usage
  parameter_block.fill(0)
  // state, 'param block'

  this.b = new Uint8Array(128)
  this.h = new Uint32Array(16)
  this.t = 0 // input count
  this.c = 0 // pointer within buffer
  this.outlen = outlen // output length in bytes

  parameter_block[0] = outlen
  if (key) parameter_block[1] = key.length
  parameter_block[2] = 1 // fanout
  parameter_block[3] = 1 // depth

  if (salt) parameter_block.set(salt, 32)
  if (personal) parameter_block.set(personal, 48)

  // initialize hash state
  for (var i = 0; i < 16; i++) {
    this.h[i] = BLAKE2B_IV32[i] ^ B2B_GET32(parameter_block, i * 4)
  }

  // key the hash, if applicable
  if (key) {
    blake2bUpdate(this, key)
    // at the end
    this.c = 128
  }
}

Blake2b.prototype.update = function (input) {
  assert(input != null, 'input must be Uint8Array or Buffer')
  blake2bUpdate(this, input)
  return this
}

Blake2b.prototype.digest = function (out) {
  var buf = (!out || out === 'binary' || out === 'hex') ? new Uint8Array(this.outlen) : out
  assert(buf.length >= this.outlen, 'out must have at least outlen bytes of space')
  blake2bFinal(this, buf)
  if (out === 'hex') return hexSlice(buf)
  return buf
}

Blake2b.prototype.final = Blake2b.prototype.digest

Blake2b.ready = function (cb) {
  b2wasm.ready(function () {
    cb() // ignore the error
  })
}

// Updates a BLAKE2b streaming hash
// Requires hash context and Uint8Array (byte array)
function blake2bUpdate (ctx, input) {
  for (var i = 0; i < input.length; i++) {
    if (ctx.c === 128) { // buffer full ?
      ctx.t += ctx.c // add counters
      blake2bCompress(ctx, false) // compress (not last)
      ctx.c = 0 // counter to zero
    }
    ctx.b[ctx.c++] = input[i]
  }
}

// Completes a BLAKE2b streaming hash
// Returns a Uint8Array containing the message digest
function blake2bFinal (ctx, out) {
  ctx.t += ctx.c // mark last block offset

  while (ctx.c < 128) { // fill up with zeros
    ctx.b[ctx.c++] = 0
  }
  blake2bCompress(ctx, true) // final block flag = 1

  for (var i = 0; i < ctx.outlen; i++) {
    out[i] = ctx.h[i >> 2] >> (8 * (i & 3))
  }
  return out
}

function hexSlice (buf) {
  var str = ''
  for (var i = 0; i < buf.length; i++) str += toHex(buf[i])
  return str
}

function toHex (n) {
  if (n < 16) return '0' + n.toString(16)
  return n.toString(16)
}

var Proto = Blake2b

module.exports = function createHash (outlen, key, salt, personal, noAssert) {
  if (noAssert !== true) {
    assert(outlen >= BYTES_MIN, 'outlen must be at least ' + BYTES_MIN + ', was given ' + outlen)
    assert(outlen <= BYTES_MAX, 'outlen must be at most ' + BYTES_MAX + ', was given ' + outlen)
    if (key != null) assert(key.length >= KEYBYTES_MIN, 'key must be at least ' + KEYBYTES_MIN + ', was given ' + key.length)
    if (key != null) assert(key.length <= KEYBYTES_MAX, 'key must be at most ' + KEYBYTES_MAX + ', was given ' + key.length)
    if (salt != null) assert(salt.length === SALTBYTES, 'salt must be exactly ' + SALTBYTES + ', was given ' + salt.length)
    if (personal != null) assert(personal.length === PERSONALBYTES, 'personal must be exactly ' + PERSONALBYTES + ', was given ' + personal.length)
  }

  return new Proto(outlen, key, salt, personal)
}

module.exports.ready = function (cb) {
  b2wasm.ready(function () { // ignore errors
    cb()
  })
}

module.exports.WASM_SUPPORTED = b2wasm.SUPPORTED
module.exports.WASM_LOADED = false

var BYTES_MIN = module.exports.BYTES_MIN = 16
var BYTES_MAX = module.exports.BYTES_MAX = 64
var BYTES = module.exports.BYTES = 32
var KEYBYTES_MIN = module.exports.KEYBYTES_MIN = 16
var KEYBYTES_MAX = module.exports.KEYBYTES_MAX = 64
var KEYBYTES = module.exports.KEYBYTES = 32
var SALTBYTES = module.exports.SALTBYTES = 16
var PERSONALBYTES = module.exports.PERSONALBYTES = 16

b2wasm.ready(function (err) {
  if (!err) {
    module.exports.WASM_LOADED = true
    Proto = b2wasm
  }
})

},{"blake2b-wasm":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/blake2b-wasm/index.js","nanoassert":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/nanoassert/index.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/browser-resolve/empty.js":[function(require,module,exports){

},{}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/browserify/node_modules/events/events.js":[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

var objectCreate = Object.create || objectCreatePolyfill
var objectKeys = Object.keys || objectKeysPolyfill
var bind = Function.prototype.bind || functionBindPolyfill

function EventEmitter() {
  if (!this._events || !Object.prototype.hasOwnProperty.call(this, '_events')) {
    this._events = objectCreate(null);
    this._eventsCount = 0;
  }

  this._maxListeners = this._maxListeners || undefined;
}
module.exports = EventEmitter;

// Backwards-compat with node 0.10.x
EventEmitter.EventEmitter = EventEmitter;

EventEmitter.prototype._events = undefined;
EventEmitter.prototype._maxListeners = undefined;

// By default EventEmitters will print a warning if more than 10 listeners are
// added to it. This is a useful default which helps finding memory leaks.
var defaultMaxListeners = 10;

var hasDefineProperty;
try {
  var o = {};
  if (Object.defineProperty) Object.defineProperty(o, 'x', { value: 0 });
  hasDefineProperty = o.x === 0;
} catch (err) { hasDefineProperty = false }
if (hasDefineProperty) {
  Object.defineProperty(EventEmitter, 'defaultMaxListeners', {
    enumerable: true,
    get: function() {
      return defaultMaxListeners;
    },
    set: function(arg) {
      // check whether the input is a positive number (whose value is zero or
      // greater and not a NaN).
      if (typeof arg !== 'number' || arg < 0 || arg !== arg)
        throw new TypeError('"defaultMaxListeners" must be a positive number');
      defaultMaxListeners = arg;
    }
  });
} else {
  EventEmitter.defaultMaxListeners = defaultMaxListeners;
}

// Obviously not all Emitters should be limited to 10. This function allows
// that to be increased. Set to zero for unlimited.
EventEmitter.prototype.setMaxListeners = function setMaxListeners(n) {
  if (typeof n !== 'number' || n < 0 || isNaN(n))
    throw new TypeError('"n" argument must be a positive number');
  this._maxListeners = n;
  return this;
};

function $getMaxListeners(that) {
  if (that._maxListeners === undefined)
    return EventEmitter.defaultMaxListeners;
  return that._maxListeners;
}

EventEmitter.prototype.getMaxListeners = function getMaxListeners() {
  return $getMaxListeners(this);
};

// These standalone emit* functions are used to optimize calling of event
// handlers for fast cases because emit() itself often has a variable number of
// arguments and can be deoptimized because of that. These functions always have
// the same number of arguments and thus do not get deoptimized, so the code
// inside them can execute faster.
function emitNone(handler, isFn, self) {
  if (isFn)
    handler.call(self);
  else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i)
      listeners[i].call(self);
  }
}
function emitOne(handler, isFn, self, arg1) {
  if (isFn)
    handler.call(self, arg1);
  else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i)
      listeners[i].call(self, arg1);
  }
}
function emitTwo(handler, isFn, self, arg1, arg2) {
  if (isFn)
    handler.call(self, arg1, arg2);
  else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i)
      listeners[i].call(self, arg1, arg2);
  }
}
function emitThree(handler, isFn, self, arg1, arg2, arg3) {
  if (isFn)
    handler.call(self, arg1, arg2, arg3);
  else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i)
      listeners[i].call(self, arg1, arg2, arg3);
  }
}

function emitMany(handler, isFn, self, args) {
  if (isFn)
    handler.apply(self, args);
  else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i)
      listeners[i].apply(self, args);
  }
}

EventEmitter.prototype.emit = function emit(type) {
  var er, handler, len, args, i, events;
  var doError = (type === 'error');

  events = this._events;
  if (events)
    doError = (doError && events.error == null);
  else if (!doError)
    return false;

  // If there is no 'error' event listener then throw.
  if (doError) {
    if (arguments.length > 1)
      er = arguments[1];
    if (er instanceof Error) {
      throw er; // Unhandled 'error' event
    } else {
      // At least give some kind of context to the user
      var err = new Error('Unhandled "error" event. (' + er + ')');
      err.context = er;
      throw err;
    }
    return false;
  }

  handler = events[type];

  if (!handler)
    return false;

  var isFn = typeof handler === 'function';
  len = arguments.length;
  switch (len) {
      // fast cases
    case 1:
      emitNone(handler, isFn, this);
      break;
    case 2:
      emitOne(handler, isFn, this, arguments[1]);
      break;
    case 3:
      emitTwo(handler, isFn, this, arguments[1], arguments[2]);
      break;
    case 4:
      emitThree(handler, isFn, this, arguments[1], arguments[2], arguments[3]);
      break;
      // slower
    default:
      args = new Array(len - 1);
      for (i = 1; i < len; i++)
        args[i - 1] = arguments[i];
      emitMany(handler, isFn, this, args);
  }

  return true;
};

function _addListener(target, type, listener, prepend) {
  var m;
  var events;
  var existing;

  if (typeof listener !== 'function')
    throw new TypeError('"listener" argument must be a function');

  events = target._events;
  if (!events) {
    events = target._events = objectCreate(null);
    target._eventsCount = 0;
  } else {
    // To avoid recursion in the case that type === "newListener"! Before
    // adding it to the listeners, first emit "newListener".
    if (events.newListener) {
      target.emit('newListener', type,
          listener.listener ? listener.listener : listener);

      // Re-assign `events` because a newListener handler could have caused the
      // this._events to be assigned to a new object
      events = target._events;
    }
    existing = events[type];
  }

  if (!existing) {
    // Optimize the case of one listener. Don't need the extra array object.
    existing = events[type] = listener;
    ++target._eventsCount;
  } else {
    if (typeof existing === 'function') {
      // Adding the second element, need to change to array.
      existing = events[type] =
          prepend ? [listener, existing] : [existing, listener];
    } else {
      // If we've already got an array, just append.
      if (prepend) {
        existing.unshift(listener);
      } else {
        existing.push(listener);
      }
    }

    // Check for listener leak
    if (!existing.warned) {
      m = $getMaxListeners(target);
      if (m && m > 0 && existing.length > m) {
        existing.warned = true;
        var w = new Error('Possible EventEmitter memory leak detected. ' +
            existing.length + ' "' + String(type) + '" listeners ' +
            'added. Use emitter.setMaxListeners() to ' +
            'increase limit.');
        w.name = 'MaxListenersExceededWarning';
        w.emitter = target;
        w.type = type;
        w.count = existing.length;
        if (typeof console === 'object' && console.warn) {
          console.warn('%s: %s', w.name, w.message);
        }
      }
    }
  }

  return target;
}

EventEmitter.prototype.addListener = function addListener(type, listener) {
  return _addListener(this, type, listener, false);
};

EventEmitter.prototype.on = EventEmitter.prototype.addListener;

EventEmitter.prototype.prependListener =
    function prependListener(type, listener) {
      return _addListener(this, type, listener, true);
    };

function onceWrapper() {
  if (!this.fired) {
    this.target.removeListener(this.type, this.wrapFn);
    this.fired = true;
    switch (arguments.length) {
      case 0:
        return this.listener.call(this.target);
      case 1:
        return this.listener.call(this.target, arguments[0]);
      case 2:
        return this.listener.call(this.target, arguments[0], arguments[1]);
      case 3:
        return this.listener.call(this.target, arguments[0], arguments[1],
            arguments[2]);
      default:
        var args = new Array(arguments.length);
        for (var i = 0; i < args.length; ++i)
          args[i] = arguments[i];
        this.listener.apply(this.target, args);
    }
  }
}

function _onceWrap(target, type, listener) {
  var state = { fired: false, wrapFn: undefined, target: target, type: type, listener: listener };
  var wrapped = bind.call(onceWrapper, state);
  wrapped.listener = listener;
  state.wrapFn = wrapped;
  return wrapped;
}

EventEmitter.prototype.once = function once(type, listener) {
  if (typeof listener !== 'function')
    throw new TypeError('"listener" argument must be a function');
  this.on(type, _onceWrap(this, type, listener));
  return this;
};

EventEmitter.prototype.prependOnceListener =
    function prependOnceListener(type, listener) {
      if (typeof listener !== 'function')
        throw new TypeError('"listener" argument must be a function');
      this.prependListener(type, _onceWrap(this, type, listener));
      return this;
    };

// Emits a 'removeListener' event if and only if the listener was removed.
EventEmitter.prototype.removeListener =
    function removeListener(type, listener) {
      var list, events, position, i, originalListener;

      if (typeof listener !== 'function')
        throw new TypeError('"listener" argument must be a function');

      events = this._events;
      if (!events)
        return this;

      list = events[type];
      if (!list)
        return this;

      if (list === listener || list.listener === listener) {
        if (--this._eventsCount === 0)
          this._events = objectCreate(null);
        else {
          delete events[type];
          if (events.removeListener)
            this.emit('removeListener', type, list.listener || listener);
        }
      } else if (typeof list !== 'function') {
        position = -1;

        for (i = list.length - 1; i >= 0; i--) {
          if (list[i] === listener || list[i].listener === listener) {
            originalListener = list[i].listener;
            position = i;
            break;
          }
        }

        if (position < 0)
          return this;

        if (position === 0)
          list.shift();
        else
          spliceOne(list, position);

        if (list.length === 1)
          events[type] = list[0];

        if (events.removeListener)
          this.emit('removeListener', type, originalListener || listener);
      }

      return this;
    };

EventEmitter.prototype.removeAllListeners =
    function removeAllListeners(type) {
      var listeners, events, i;

      events = this._events;
      if (!events)
        return this;

      // not listening for removeListener, no need to emit
      if (!events.removeListener) {
        if (arguments.length === 0) {
          this._events = objectCreate(null);
          this._eventsCount = 0;
        } else if (events[type]) {
          if (--this._eventsCount === 0)
            this._events = objectCreate(null);
          else
            delete events[type];
        }
        return this;
      }

      // emit removeListener for all listeners on all events
      if (arguments.length === 0) {
        var keys = objectKeys(events);
        var key;
        for (i = 0; i < keys.length; ++i) {
          key = keys[i];
          if (key === 'removeListener') continue;
          this.removeAllListeners(key);
        }
        this.removeAllListeners('removeListener');
        this._events = objectCreate(null);
        this._eventsCount = 0;
        return this;
      }

      listeners = events[type];

      if (typeof listeners === 'function') {
        this.removeListener(type, listeners);
      } else if (listeners) {
        // LIFO order
        for (i = listeners.length - 1; i >= 0; i--) {
          this.removeListener(type, listeners[i]);
        }
      }

      return this;
    };

function _listeners(target, type, unwrap) {
  var events = target._events;

  if (!events)
    return [];

  var evlistener = events[type];
  if (!evlistener)
    return [];

  if (typeof evlistener === 'function')
    return unwrap ? [evlistener.listener || evlistener] : [evlistener];

  return unwrap ? unwrapListeners(evlistener) : arrayClone(evlistener, evlistener.length);
}

EventEmitter.prototype.listeners = function listeners(type) {
  return _listeners(this, type, true);
};

EventEmitter.prototype.rawListeners = function rawListeners(type) {
  return _listeners(this, type, false);
};

EventEmitter.listenerCount = function(emitter, type) {
  if (typeof emitter.listenerCount === 'function') {
    return emitter.listenerCount(type);
  } else {
    return listenerCount.call(emitter, type);
  }
};

EventEmitter.prototype.listenerCount = listenerCount;
function listenerCount(type) {
  var events = this._events;

  if (events) {
    var evlistener = events[type];

    if (typeof evlistener === 'function') {
      return 1;
    } else if (evlistener) {
      return evlistener.length;
    }
  }

  return 0;
}

EventEmitter.prototype.eventNames = function eventNames() {
  return this._eventsCount > 0 ? Reflect.ownKeys(this._events) : [];
};

// About 1.5x faster than the two-arg version of Array#splice().
function spliceOne(list, index) {
  for (var i = index, k = i + 1, n = list.length; k < n; i += 1, k += 1)
    list[i] = list[k];
  list.pop();
}

function arrayClone(arr, n) {
  var copy = new Array(n);
  for (var i = 0; i < n; ++i)
    copy[i] = arr[i];
  return copy;
}

function unwrapListeners(arr) {
  var ret = new Array(arr.length);
  for (var i = 0; i < ret.length; ++i) {
    ret[i] = arr[i].listener || arr[i];
  }
  return ret;
}

function objectCreatePolyfill(proto) {
  var F = function() {};
  F.prototype = proto;
  return new F;
}
function objectKeysPolyfill(obj) {
  var keys = [];
  for (var k in obj) if (Object.prototype.hasOwnProperty.call(obj, k)) {
    keys.push(k);
  }
  return k;
}
function functionBindPolyfill(context) {
  var fn = this;
  return function () {
    return fn.apply(context, arguments);
  };
}

},{}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/buffer-alloc-unsafe/index.js":[function(require,module,exports){
(function (Buffer){
function allocUnsafe (size) {
  if (typeof size !== 'number') {
    throw new TypeError('"size" argument must be a number')
  }

  if (size < 0) {
    throw new RangeError('"size" argument must not be negative')
  }

  if (Buffer.allocUnsafe) {
    return Buffer.allocUnsafe(size)
  } else {
    return new Buffer(size)
  }
}

module.exports = allocUnsafe

}).call(this,require("buffer").Buffer)
},{"buffer":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/buffer/index.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/buffer-alloc/index.js":[function(require,module,exports){
(function (Buffer){
var bufferFill = require('buffer-fill')
var allocUnsafe = require('buffer-alloc-unsafe')

module.exports = function alloc (size, fill, encoding) {
  if (typeof size !== 'number') {
    throw new TypeError('"size" argument must be a number')
  }

  if (size < 0) {
    throw new RangeError('"size" argument must not be negative')
  }

  if (Buffer.alloc) {
    return Buffer.alloc(size, fill, encoding)
  }

  var buffer = allocUnsafe(size)

  if (size === 0) {
    return buffer
  }

  if (fill === undefined) {
    return bufferFill(buffer, 0)
  }

  if (typeof encoding !== 'string') {
    encoding = undefined
  }

  return bufferFill(buffer, fill, encoding)
}

}).call(this,require("buffer").Buffer)
},{"buffer":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/buffer/index.js","buffer-alloc-unsafe":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/buffer-alloc-unsafe/index.js","buffer-fill":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/buffer-fill/index.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/buffer-fill/index.js":[function(require,module,exports){
(function (Buffer){
/* Node.js 6.4.0 and up has full support */
var hasFullSupport = (function () {
  try {
    if (!Buffer.isEncoding('latin1')) {
      return false
    }

    var buf = Buffer.alloc ? Buffer.alloc(4) : new Buffer(4)

    buf.fill('ab', 'ucs2')

    return (buf.toString('hex') === '61006200')
  } catch (_) {
    return false
  }
}())

function isSingleByte (val) {
  return (val.length === 1 && val.charCodeAt(0) < 256)
}

function fillWithNumber (buffer, val, start, end) {
  if (start < 0 || end > buffer.length) {
    throw new RangeError('Out of range index')
  }

  start = start >>> 0
  end = end === undefined ? buffer.length : end >>> 0

  if (end > start) {
    buffer.fill(val, start, end)
  }

  return buffer
}

function fillWithBuffer (buffer, val, start, end) {
  if (start < 0 || end > buffer.length) {
    throw new RangeError('Out of range index')
  }

  if (end <= start) {
    return buffer
  }

  start = start >>> 0
  end = end === undefined ? buffer.length : end >>> 0

  var pos = start
  var len = val.length
  while (pos <= (end - len)) {
    val.copy(buffer, pos)
    pos += len
  }

  if (pos !== end) {
    val.copy(buffer, pos, 0, end - pos)
  }

  return buffer
}

function fill (buffer, val, start, end, encoding) {
  if (hasFullSupport) {
    return buffer.fill(val, start, end, encoding)
  }

  if (typeof val === 'number') {
    return fillWithNumber(buffer, val, start, end)
  }

  if (typeof val === 'string') {
    if (typeof start === 'string') {
      encoding = start
      start = 0
      end = buffer.length
    } else if (typeof end === 'string') {
      encoding = end
      end = buffer.length
    }

    if (encoding !== undefined && typeof encoding !== 'string') {
      throw new TypeError('encoding must be a string')
    }

    if (encoding === 'latin1') {
      encoding = 'binary'
    }

    if (typeof encoding === 'string' && !Buffer.isEncoding(encoding)) {
      throw new TypeError('Unknown encoding: ' + encoding)
    }

    if (val === '') {
      return fillWithNumber(buffer, 0, start, end)
    }

    if (isSingleByte(val)) {
      return fillWithNumber(buffer, val.charCodeAt(0), start, end)
    }

    val = new Buffer(val, encoding)
  }

  if (Buffer.isBuffer(val)) {
    return fillWithBuffer(buffer, val, start, end)
  }

  // Other values (e.g. undefined, boolean, object) results in zero-fill
  return fillWithNumber(buffer, 0, start, end)
}

module.exports = fill

}).call(this,require("buffer").Buffer)
},{"buffer":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/buffer/index.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/buffer-from/index.js":[function(require,module,exports){
(function (Buffer){
var toString = Object.prototype.toString

var isModern = (
  typeof Buffer.alloc === 'function' &&
  typeof Buffer.allocUnsafe === 'function' &&
  typeof Buffer.from === 'function'
)

function isArrayBuffer (input) {
  return toString.call(input).slice(8, -1) === 'ArrayBuffer'
}

function fromArrayBuffer (obj, byteOffset, length) {
  byteOffset >>>= 0

  var maxLength = obj.byteLength - byteOffset

  if (maxLength < 0) {
    throw new RangeError("'offset' is out of bounds")
  }

  if (length === undefined) {
    length = maxLength
  } else {
    length >>>= 0

    if (length > maxLength) {
      throw new RangeError("'length' is out of bounds")
    }
  }

  return isModern
    ? Buffer.from(obj.slice(byteOffset, byteOffset + length))
    : new Buffer(new Uint8Array(obj.slice(byteOffset, byteOffset + length)))
}

function fromString (string, encoding) {
  if (typeof encoding !== 'string' || encoding === '') {
    encoding = 'utf8'
  }

  if (!Buffer.isEncoding(encoding)) {
    throw new TypeError('"encoding" must be a valid string encoding')
  }

  return isModern
    ? Buffer.from(string, encoding)
    : new Buffer(string, encoding)
}

function bufferFrom (value, encodingOrOffset, length) {
  if (typeof value === 'number') {
    throw new TypeError('"value" argument must not be a number')
  }

  if (isArrayBuffer(value)) {
    return fromArrayBuffer(value, encodingOrOffset, length)
  }

  if (typeof value === 'string') {
    return fromString(value, encodingOrOffset)
  }

  return isModern
    ? Buffer.from(value)
    : new Buffer(value)
}

module.exports = bufferFrom

}).call(this,require("buffer").Buffer)
},{"buffer":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/buffer/index.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/buffer/index.js":[function(require,module,exports){
(function (Buffer){
/*!
 * The buffer module from node.js, for the browser.
 *
 * @author   Feross Aboukhadijeh <https://feross.org>
 * @license  MIT
 */
/* eslint-disable no-proto */

'use strict'

var base64 = require('base64-js')
var ieee754 = require('ieee754')

exports.Buffer = Buffer
exports.SlowBuffer = SlowBuffer
exports.INSPECT_MAX_BYTES = 50

var K_MAX_LENGTH = 0x7fffffff
exports.kMaxLength = K_MAX_LENGTH

/**
 * If `Buffer.TYPED_ARRAY_SUPPORT`:
 *   === true    Use Uint8Array implementation (fastest)
 *   === false   Print warning and recommend using `buffer` v4.x which has an Object
 *               implementation (most compatible, even IE6)
 *
 * Browsers that support typed arrays are IE 10+, Firefox 4+, Chrome 7+, Safari 5.1+,
 * Opera 11.6+, iOS 4.2+.
 *
 * We report that the browser does not support typed arrays if the are not subclassable
 * using __proto__. Firefox 4-29 lacks support for adding new properties to `Uint8Array`
 * (See: https://bugzilla.mozilla.org/show_bug.cgi?id=695438). IE 10 lacks support
 * for __proto__ and has a buggy typed array implementation.
 */
Buffer.TYPED_ARRAY_SUPPORT = typedArraySupport()

if (!Buffer.TYPED_ARRAY_SUPPORT && typeof console !== 'undefined' &&
    typeof console.error === 'function') {
  console.error(
    'This browser lacks typed array (Uint8Array) support which is required by ' +
    '`buffer` v5.x. Use `buffer` v4.x if you require old browser support.'
  )
}

function typedArraySupport () {
  // Can typed array instances can be augmented?
  try {
    var arr = new Uint8Array(1)
    arr.__proto__ = {__proto__: Uint8Array.prototype, foo: function () { return 42 }}
    return arr.foo() === 42
  } catch (e) {
    return false
  }
}

Object.defineProperty(Buffer.prototype, 'parent', {
  get: function () {
    if (!(this instanceof Buffer)) {
      return undefined
    }
    return this.buffer
  }
})

Object.defineProperty(Buffer.prototype, 'offset', {
  get: function () {
    if (!(this instanceof Buffer)) {
      return undefined
    }
    return this.byteOffset
  }
})

function createBuffer (length) {
  if (length > K_MAX_LENGTH) {
    throw new RangeError('Invalid typed array length')
  }
  // Return an augmented `Uint8Array` instance
  var buf = new Uint8Array(length)
  buf.__proto__ = Buffer.prototype
  return buf
}

/**
 * The Buffer constructor returns instances of `Uint8Array` that have their
 * prototype changed to `Buffer.prototype`. Furthermore, `Buffer` is a subclass of
 * `Uint8Array`, so the returned instances will have all the node `Buffer` methods
 * and the `Uint8Array` methods. Square bracket notation works as expected -- it
 * returns a single octet.
 *
 * The `Uint8Array` prototype remains unmodified.
 */

function Buffer (arg, encodingOrOffset, length) {
  // Common case.
  if (typeof arg === 'number') {
    if (typeof encodingOrOffset === 'string') {
      throw new Error(
        'If encoding is specified then the first argument must be a string'
      )
    }
    return allocUnsafe(arg)
  }
  return from(arg, encodingOrOffset, length)
}

// Fix subarray() in ES2016. See: https://github.com/feross/buffer/pull/97
if (typeof Symbol !== 'undefined' && Symbol.species &&
    Buffer[Symbol.species] === Buffer) {
  Object.defineProperty(Buffer, Symbol.species, {
    value: null,
    configurable: true,
    enumerable: false,
    writable: false
  })
}

Buffer.poolSize = 8192 // not used by this implementation

function from (value, encodingOrOffset, length) {
  if (typeof value === 'number') {
    throw new TypeError('"value" argument must not be a number')
  }

  if (isArrayBuffer(value) || (value && isArrayBuffer(value.buffer))) {
    return fromArrayBuffer(value, encodingOrOffset, length)
  }

  if (typeof value === 'string') {
    return fromString(value, encodingOrOffset)
  }

  return fromObject(value)
}

/**
 * Functionally equivalent to Buffer(arg, encoding) but throws a TypeError
 * if value is a number.
 * Buffer.from(str[, encoding])
 * Buffer.from(array)
 * Buffer.from(buffer)
 * Buffer.from(arrayBuffer[, byteOffset[, length]])
 **/
Buffer.from = function (value, encodingOrOffset, length) {
  return from(value, encodingOrOffset, length)
}

// Note: Change prototype *after* Buffer.from is defined to workaround Chrome bug:
// https://github.com/feross/buffer/pull/148
Buffer.prototype.__proto__ = Uint8Array.prototype
Buffer.__proto__ = Uint8Array

function assertSize (size) {
  if (typeof size !== 'number') {
    throw new TypeError('"size" argument must be of type number')
  } else if (size < 0) {
    throw new RangeError('"size" argument must not be negative')
  }
}

function alloc (size, fill, encoding) {
  assertSize(size)
  if (size <= 0) {
    return createBuffer(size)
  }
  if (fill !== undefined) {
    // Only pay attention to encoding if it's a string. This
    // prevents accidentally sending in a number that would
    // be interpretted as a start offset.
    return typeof encoding === 'string'
      ? createBuffer(size).fill(fill, encoding)
      : createBuffer(size).fill(fill)
  }
  return createBuffer(size)
}

/**
 * Creates a new filled Buffer instance.
 * alloc(size[, fill[, encoding]])
 **/
Buffer.alloc = function (size, fill, encoding) {
  return alloc(size, fill, encoding)
}

function allocUnsafe (size) {
  assertSize(size)
  return createBuffer(size < 0 ? 0 : checked(size) | 0)
}

/**
 * Equivalent to Buffer(num), by default creates a non-zero-filled Buffer instance.
 * */
Buffer.allocUnsafe = function (size) {
  return allocUnsafe(size)
}
/**
 * Equivalent to SlowBuffer(num), by default creates a non-zero-filled Buffer instance.
 */
Buffer.allocUnsafeSlow = function (size) {
  return allocUnsafe(size)
}

function fromString (string, encoding) {
  if (typeof encoding !== 'string' || encoding === '') {
    encoding = 'utf8'
  }

  if (!Buffer.isEncoding(encoding)) {
    throw new TypeError('Unknown encoding: ' + encoding)
  }

  var length = byteLength(string, encoding) | 0
  var buf = createBuffer(length)

  var actual = buf.write(string, encoding)

  if (actual !== length) {
    // Writing a hex string, for example, that contains invalid characters will
    // cause everything after the first invalid character to be ignored. (e.g.
    // 'abxxcd' will be treated as 'ab')
    buf = buf.slice(0, actual)
  }

  return buf
}

function fromArrayLike (array) {
  var length = array.length < 0 ? 0 : checked(array.length) | 0
  var buf = createBuffer(length)
  for (var i = 0; i < length; i += 1) {
    buf[i] = array[i] & 255
  }
  return buf
}

function fromArrayBuffer (array, byteOffset, length) {
  if (byteOffset < 0 || array.byteLength < byteOffset) {
    throw new RangeError('"offset" is outside of buffer bounds')
  }

  if (array.byteLength < byteOffset + (length || 0)) {
    throw new RangeError('"length" is outside of buffer bounds')
  }

  var buf
  if (byteOffset === undefined && length === undefined) {
    buf = new Uint8Array(array)
  } else if (length === undefined) {
    buf = new Uint8Array(array, byteOffset)
  } else {
    buf = new Uint8Array(array, byteOffset, length)
  }

  // Return an augmented `Uint8Array` instance
  buf.__proto__ = Buffer.prototype
  return buf
}

function fromObject (obj) {
  if (Buffer.isBuffer(obj)) {
    var len = checked(obj.length) | 0
    var buf = createBuffer(len)

    if (buf.length === 0) {
      return buf
    }

    obj.copy(buf, 0, 0, len)
    return buf
  }

  if (obj) {
    if (ArrayBuffer.isView(obj) || 'length' in obj) {
      if (typeof obj.length !== 'number' || numberIsNaN(obj.length)) {
        return createBuffer(0)
      }
      return fromArrayLike(obj)
    }

    if (obj.type === 'Buffer' && Array.isArray(obj.data)) {
      return fromArrayLike(obj.data)
    }
  }

  throw new TypeError('The first argument must be one of type string, Buffer, ArrayBuffer, Array, or Array-like Object.')
}

function checked (length) {
  // Note: cannot use `length < K_MAX_LENGTH` here because that fails when
  // length is NaN (which is otherwise coerced to zero.)
  if (length >= K_MAX_LENGTH) {
    throw new RangeError('Attempt to allocate Buffer larger than maximum ' +
                         'size: 0x' + K_MAX_LENGTH.toString(16) + ' bytes')
  }
  return length | 0
}

function SlowBuffer (length) {
  if (+length != length) { // eslint-disable-line eqeqeq
    length = 0
  }
  return Buffer.alloc(+length)
}

Buffer.isBuffer = function isBuffer (b) {
  return b != null && b._isBuffer === true
}

Buffer.compare = function compare (a, b) {
  if (!Buffer.isBuffer(a) || !Buffer.isBuffer(b)) {
    throw new TypeError('Arguments must be Buffers')
  }

  if (a === b) return 0

  var x = a.length
  var y = b.length

  for (var i = 0, len = Math.min(x, y); i < len; ++i) {
    if (a[i] !== b[i]) {
      x = a[i]
      y = b[i]
      break
    }
  }

  if (x < y) return -1
  if (y < x) return 1
  return 0
}

Buffer.isEncoding = function isEncoding (encoding) {
  switch (String(encoding).toLowerCase()) {
    case 'hex':
    case 'utf8':
    case 'utf-8':
    case 'ascii':
    case 'latin1':
    case 'binary':
    case 'base64':
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      return true
    default:
      return false
  }
}

Buffer.concat = function concat (list, length) {
  if (!Array.isArray(list)) {
    throw new TypeError('"list" argument must be an Array of Buffers')
  }

  if (list.length === 0) {
    return Buffer.alloc(0)
  }

  var i
  if (length === undefined) {
    length = 0
    for (i = 0; i < list.length; ++i) {
      length += list[i].length
    }
  }

  var buffer = Buffer.allocUnsafe(length)
  var pos = 0
  for (i = 0; i < list.length; ++i) {
    var buf = list[i]
    if (ArrayBuffer.isView(buf)) {
      buf = Buffer.from(buf)
    }
    if (!Buffer.isBuffer(buf)) {
      throw new TypeError('"list" argument must be an Array of Buffers')
    }
    buf.copy(buffer, pos)
    pos += buf.length
  }
  return buffer
}

function byteLength (string, encoding) {
  if (Buffer.isBuffer(string)) {
    return string.length
  }
  if (ArrayBuffer.isView(string) || isArrayBuffer(string)) {
    return string.byteLength
  }
  if (typeof string !== 'string') {
    string = '' + string
  }

  var len = string.length
  if (len === 0) return 0

  // Use a for loop to avoid recursion
  var loweredCase = false
  for (;;) {
    switch (encoding) {
      case 'ascii':
      case 'latin1':
      case 'binary':
        return len
      case 'utf8':
      case 'utf-8':
      case undefined:
        return utf8ToBytes(string).length
      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return len * 2
      case 'hex':
        return len >>> 1
      case 'base64':
        return base64ToBytes(string).length
      default:
        if (loweredCase) return utf8ToBytes(string).length // assume utf8
        encoding = ('' + encoding).toLowerCase()
        loweredCase = true
    }
  }
}
Buffer.byteLength = byteLength

function slowToString (encoding, start, end) {
  var loweredCase = false

  // No need to verify that "this.length <= MAX_UINT32" since it's a read-only
  // property of a typed array.

  // This behaves neither like String nor Uint8Array in that we set start/end
  // to their upper/lower bounds if the value passed is out of range.
  // undefined is handled specially as per ECMA-262 6th Edition,
  // Section 13.3.3.7 Runtime Semantics: KeyedBindingInitialization.
  if (start === undefined || start < 0) {
    start = 0
  }
  // Return early if start > this.length. Done here to prevent potential uint32
  // coercion fail below.
  if (start > this.length) {
    return ''
  }

  if (end === undefined || end > this.length) {
    end = this.length
  }

  if (end <= 0) {
    return ''
  }

  // Force coersion to uint32. This will also coerce falsey/NaN values to 0.
  end >>>= 0
  start >>>= 0

  if (end <= start) {
    return ''
  }

  if (!encoding) encoding = 'utf8'

  while (true) {
    switch (encoding) {
      case 'hex':
        return hexSlice(this, start, end)

      case 'utf8':
      case 'utf-8':
        return utf8Slice(this, start, end)

      case 'ascii':
        return asciiSlice(this, start, end)

      case 'latin1':
      case 'binary':
        return latin1Slice(this, start, end)

      case 'base64':
        return base64Slice(this, start, end)

      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return utf16leSlice(this, start, end)

      default:
        if (loweredCase) throw new TypeError('Unknown encoding: ' + encoding)
        encoding = (encoding + '').toLowerCase()
        loweredCase = true
    }
  }
}

// This property is used by `Buffer.isBuffer` (and the `is-buffer` npm package)
// to detect a Buffer instance. It's not possible to use `instanceof Buffer`
// reliably in a browserify context because there could be multiple different
// copies of the 'buffer' package in use. This method works even for Buffer
// instances that were created from another copy of the `buffer` package.
// See: https://github.com/feross/buffer/issues/154
Buffer.prototype._isBuffer = true

function swap (b, n, m) {
  var i = b[n]
  b[n] = b[m]
  b[m] = i
}

Buffer.prototype.swap16 = function swap16 () {
  var len = this.length
  if (len % 2 !== 0) {
    throw new RangeError('Buffer size must be a multiple of 16-bits')
  }
  for (var i = 0; i < len; i += 2) {
    swap(this, i, i + 1)
  }
  return this
}

Buffer.prototype.swap32 = function swap32 () {
  var len = this.length
  if (len % 4 !== 0) {
    throw new RangeError('Buffer size must be a multiple of 32-bits')
  }
  for (var i = 0; i < len; i += 4) {
    swap(this, i, i + 3)
    swap(this, i + 1, i + 2)
  }
  return this
}

Buffer.prototype.swap64 = function swap64 () {
  var len = this.length
  if (len % 8 !== 0) {
    throw new RangeError('Buffer size must be a multiple of 64-bits')
  }
  for (var i = 0; i < len; i += 8) {
    swap(this, i, i + 7)
    swap(this, i + 1, i + 6)
    swap(this, i + 2, i + 5)
    swap(this, i + 3, i + 4)
  }
  return this
}

Buffer.prototype.toString = function toString () {
  var length = this.length
  if (length === 0) return ''
  if (arguments.length === 0) return utf8Slice(this, 0, length)
  return slowToString.apply(this, arguments)
}

Buffer.prototype.toLocaleString = Buffer.prototype.toString

Buffer.prototype.equals = function equals (b) {
  if (!Buffer.isBuffer(b)) throw new TypeError('Argument must be a Buffer')
  if (this === b) return true
  return Buffer.compare(this, b) === 0
}

Buffer.prototype.inspect = function inspect () {
  var str = ''
  var max = exports.INSPECT_MAX_BYTES
  if (this.length > 0) {
    str = this.toString('hex', 0, max).match(/.{2}/g).join(' ')
    if (this.length > max) str += ' ... '
  }
  return '<Buffer ' + str + '>'
}

Buffer.prototype.compare = function compare (target, start, end, thisStart, thisEnd) {
  if (!Buffer.isBuffer(target)) {
    throw new TypeError('Argument must be a Buffer')
  }

  if (start === undefined) {
    start = 0
  }
  if (end === undefined) {
    end = target ? target.length : 0
  }
  if (thisStart === undefined) {
    thisStart = 0
  }
  if (thisEnd === undefined) {
    thisEnd = this.length
  }

  if (start < 0 || end > target.length || thisStart < 0 || thisEnd > this.length) {
    throw new RangeError('out of range index')
  }

  if (thisStart >= thisEnd && start >= end) {
    return 0
  }
  if (thisStart >= thisEnd) {
    return -1
  }
  if (start >= end) {
    return 1
  }

  start >>>= 0
  end >>>= 0
  thisStart >>>= 0
  thisEnd >>>= 0

  if (this === target) return 0

  var x = thisEnd - thisStart
  var y = end - start
  var len = Math.min(x, y)

  var thisCopy = this.slice(thisStart, thisEnd)
  var targetCopy = target.slice(start, end)

  for (var i = 0; i < len; ++i) {
    if (thisCopy[i] !== targetCopy[i]) {
      x = thisCopy[i]
      y = targetCopy[i]
      break
    }
  }

  if (x < y) return -1
  if (y < x) return 1
  return 0
}

// Finds either the first index of `val` in `buffer` at offset >= `byteOffset`,
// OR the last index of `val` in `buffer` at offset <= `byteOffset`.
//
// Arguments:
// - buffer - a Buffer to search
// - val - a string, Buffer, or number
// - byteOffset - an index into `buffer`; will be clamped to an int32
// - encoding - an optional encoding, relevant is val is a string
// - dir - true for indexOf, false for lastIndexOf
function bidirectionalIndexOf (buffer, val, byteOffset, encoding, dir) {
  // Empty buffer means no match
  if (buffer.length === 0) return -1

  // Normalize byteOffset
  if (typeof byteOffset === 'string') {
    encoding = byteOffset
    byteOffset = 0
  } else if (byteOffset > 0x7fffffff) {
    byteOffset = 0x7fffffff
  } else if (byteOffset < -0x80000000) {
    byteOffset = -0x80000000
  }
  byteOffset = +byteOffset  // Coerce to Number.
  if (numberIsNaN(byteOffset)) {
    // byteOffset: it it's undefined, null, NaN, "foo", etc, search whole buffer
    byteOffset = dir ? 0 : (buffer.length - 1)
  }

  // Normalize byteOffset: negative offsets start from the end of the buffer
  if (byteOffset < 0) byteOffset = buffer.length + byteOffset
  if (byteOffset >= buffer.length) {
    if (dir) return -1
    else byteOffset = buffer.length - 1
  } else if (byteOffset < 0) {
    if (dir) byteOffset = 0
    else return -1
  }

  // Normalize val
  if (typeof val === 'string') {
    val = Buffer.from(val, encoding)
  }

  // Finally, search either indexOf (if dir is true) or lastIndexOf
  if (Buffer.isBuffer(val)) {
    // Special case: looking for empty string/buffer always fails
    if (val.length === 0) {
      return -1
    }
    return arrayIndexOf(buffer, val, byteOffset, encoding, dir)
  } else if (typeof val === 'number') {
    val = val & 0xFF // Search for a byte value [0-255]
    if (typeof Uint8Array.prototype.indexOf === 'function') {
      if (dir) {
        return Uint8Array.prototype.indexOf.call(buffer, val, byteOffset)
      } else {
        return Uint8Array.prototype.lastIndexOf.call(buffer, val, byteOffset)
      }
    }
    return arrayIndexOf(buffer, [ val ], byteOffset, encoding, dir)
  }

  throw new TypeError('val must be string, number or Buffer')
}

function arrayIndexOf (arr, val, byteOffset, encoding, dir) {
  var indexSize = 1
  var arrLength = arr.length
  var valLength = val.length

  if (encoding !== undefined) {
    encoding = String(encoding).toLowerCase()
    if (encoding === 'ucs2' || encoding === 'ucs-2' ||
        encoding === 'utf16le' || encoding === 'utf-16le') {
      if (arr.length < 2 || val.length < 2) {
        return -1
      }
      indexSize = 2
      arrLength /= 2
      valLength /= 2
      byteOffset /= 2
    }
  }

  function read (buf, i) {
    if (indexSize === 1) {
      return buf[i]
    } else {
      return buf.readUInt16BE(i * indexSize)
    }
  }

  var i
  if (dir) {
    var foundIndex = -1
    for (i = byteOffset; i < arrLength; i++) {
      if (read(arr, i) === read(val, foundIndex === -1 ? 0 : i - foundIndex)) {
        if (foundIndex === -1) foundIndex = i
        if (i - foundIndex + 1 === valLength) return foundIndex * indexSize
      } else {
        if (foundIndex !== -1) i -= i - foundIndex
        foundIndex = -1
      }
    }
  } else {
    if (byteOffset + valLength > arrLength) byteOffset = arrLength - valLength
    for (i = byteOffset; i >= 0; i--) {
      var found = true
      for (var j = 0; j < valLength; j++) {
        if (read(arr, i + j) !== read(val, j)) {
          found = false
          break
        }
      }
      if (found) return i
    }
  }

  return -1
}

Buffer.prototype.includes = function includes (val, byteOffset, encoding) {
  return this.indexOf(val, byteOffset, encoding) !== -1
}

Buffer.prototype.indexOf = function indexOf (val, byteOffset, encoding) {
  return bidirectionalIndexOf(this, val, byteOffset, encoding, true)
}

Buffer.prototype.lastIndexOf = function lastIndexOf (val, byteOffset, encoding) {
  return bidirectionalIndexOf(this, val, byteOffset, encoding, false)
}

function hexWrite (buf, string, offset, length) {
  offset = Number(offset) || 0
  var remaining = buf.length - offset
  if (!length) {
    length = remaining
  } else {
    length = Number(length)
    if (length > remaining) {
      length = remaining
    }
  }

  var strLen = string.length

  if (length > strLen / 2) {
    length = strLen / 2
  }
  for (var i = 0; i < length; ++i) {
    var parsed = parseInt(string.substr(i * 2, 2), 16)
    if (numberIsNaN(parsed)) return i
    buf[offset + i] = parsed
  }
  return i
}

function utf8Write (buf, string, offset, length) {
  return blitBuffer(utf8ToBytes(string, buf.length - offset), buf, offset, length)
}

function asciiWrite (buf, string, offset, length) {
  return blitBuffer(asciiToBytes(string), buf, offset, length)
}

function latin1Write (buf, string, offset, length) {
  return asciiWrite(buf, string, offset, length)
}

function base64Write (buf, string, offset, length) {
  return blitBuffer(base64ToBytes(string), buf, offset, length)
}

function ucs2Write (buf, string, offset, length) {
  return blitBuffer(utf16leToBytes(string, buf.length - offset), buf, offset, length)
}

Buffer.prototype.write = function write (string, offset, length, encoding) {
  // Buffer#write(string)
  if (offset === undefined) {
    encoding = 'utf8'
    length = this.length
    offset = 0
  // Buffer#write(string, encoding)
  } else if (length === undefined && typeof offset === 'string') {
    encoding = offset
    length = this.length
    offset = 0
  // Buffer#write(string, offset[, length][, encoding])
  } else if (isFinite(offset)) {
    offset = offset >>> 0
    if (isFinite(length)) {
      length = length >>> 0
      if (encoding === undefined) encoding = 'utf8'
    } else {
      encoding = length
      length = undefined
    }
  } else {
    throw new Error(
      'Buffer.write(string, encoding, offset[, length]) is no longer supported'
    )
  }

  var remaining = this.length - offset
  if (length === undefined || length > remaining) length = remaining

  if ((string.length > 0 && (length < 0 || offset < 0)) || offset > this.length) {
    throw new RangeError('Attempt to write outside buffer bounds')
  }

  if (!encoding) encoding = 'utf8'

  var loweredCase = false
  for (;;) {
    switch (encoding) {
      case 'hex':
        return hexWrite(this, string, offset, length)

      case 'utf8':
      case 'utf-8':
        return utf8Write(this, string, offset, length)

      case 'ascii':
        return asciiWrite(this, string, offset, length)

      case 'latin1':
      case 'binary':
        return latin1Write(this, string, offset, length)

      case 'base64':
        // Warning: maxLength not taken into account in base64Write
        return base64Write(this, string, offset, length)

      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return ucs2Write(this, string, offset, length)

      default:
        if (loweredCase) throw new TypeError('Unknown encoding: ' + encoding)
        encoding = ('' + encoding).toLowerCase()
        loweredCase = true
    }
  }
}

Buffer.prototype.toJSON = function toJSON () {
  return {
    type: 'Buffer',
    data: Array.prototype.slice.call(this._arr || this, 0)
  }
}

function base64Slice (buf, start, end) {
  if (start === 0 && end === buf.length) {
    return base64.fromByteArray(buf)
  } else {
    return base64.fromByteArray(buf.slice(start, end))
  }
}

function utf8Slice (buf, start, end) {
  end = Math.min(buf.length, end)
  var res = []

  var i = start
  while (i < end) {
    var firstByte = buf[i]
    var codePoint = null
    var bytesPerSequence = (firstByte > 0xEF) ? 4
      : (firstByte > 0xDF) ? 3
      : (firstByte > 0xBF) ? 2
      : 1

    if (i + bytesPerSequence <= end) {
      var secondByte, thirdByte, fourthByte, tempCodePoint

      switch (bytesPerSequence) {
        case 1:
          if (firstByte < 0x80) {
            codePoint = firstByte
          }
          break
        case 2:
          secondByte = buf[i + 1]
          if ((secondByte & 0xC0) === 0x80) {
            tempCodePoint = (firstByte & 0x1F) << 0x6 | (secondByte & 0x3F)
            if (tempCodePoint > 0x7F) {
              codePoint = tempCodePoint
            }
          }
          break
        case 3:
          secondByte = buf[i + 1]
          thirdByte = buf[i + 2]
          if ((secondByte & 0xC0) === 0x80 && (thirdByte & 0xC0) === 0x80) {
            tempCodePoint = (firstByte & 0xF) << 0xC | (secondByte & 0x3F) << 0x6 | (thirdByte & 0x3F)
            if (tempCodePoint > 0x7FF && (tempCodePoint < 0xD800 || tempCodePoint > 0xDFFF)) {
              codePoint = tempCodePoint
            }
          }
          break
        case 4:
          secondByte = buf[i + 1]
          thirdByte = buf[i + 2]
          fourthByte = buf[i + 3]
          if ((secondByte & 0xC0) === 0x80 && (thirdByte & 0xC0) === 0x80 && (fourthByte & 0xC0) === 0x80) {
            tempCodePoint = (firstByte & 0xF) << 0x12 | (secondByte & 0x3F) << 0xC | (thirdByte & 0x3F) << 0x6 | (fourthByte & 0x3F)
            if (tempCodePoint > 0xFFFF && tempCodePoint < 0x110000) {
              codePoint = tempCodePoint
            }
          }
      }
    }

    if (codePoint === null) {
      // we did not generate a valid codePoint so insert a
      // replacement char (U+FFFD) and advance only 1 byte
      codePoint = 0xFFFD
      bytesPerSequence = 1
    } else if (codePoint > 0xFFFF) {
      // encode to utf16 (surrogate pair dance)
      codePoint -= 0x10000
      res.push(codePoint >>> 10 & 0x3FF | 0xD800)
      codePoint = 0xDC00 | codePoint & 0x3FF
    }

    res.push(codePoint)
    i += bytesPerSequence
  }

  return decodeCodePointsArray(res)
}

// Based on http://stackoverflow.com/a/22747272/680742, the browser with
// the lowest limit is Chrome, with 0x10000 args.
// We go 1 magnitude less, for safety
var MAX_ARGUMENTS_LENGTH = 0x1000

function decodeCodePointsArray (codePoints) {
  var len = codePoints.length
  if (len <= MAX_ARGUMENTS_LENGTH) {
    return String.fromCharCode.apply(String, codePoints) // avoid extra slice()
  }

  // Decode in chunks to avoid "call stack size exceeded".
  var res = ''
  var i = 0
  while (i < len) {
    res += String.fromCharCode.apply(
      String,
      codePoints.slice(i, i += MAX_ARGUMENTS_LENGTH)
    )
  }
  return res
}

function asciiSlice (buf, start, end) {
  var ret = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; ++i) {
    ret += String.fromCharCode(buf[i] & 0x7F)
  }
  return ret
}

function latin1Slice (buf, start, end) {
  var ret = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; ++i) {
    ret += String.fromCharCode(buf[i])
  }
  return ret
}

function hexSlice (buf, start, end) {
  var len = buf.length

  if (!start || start < 0) start = 0
  if (!end || end < 0 || end > len) end = len

  var out = ''
  for (var i = start; i < end; ++i) {
    out += toHex(buf[i])
  }
  return out
}

function utf16leSlice (buf, start, end) {
  var bytes = buf.slice(start, end)
  var res = ''
  for (var i = 0; i < bytes.length; i += 2) {
    res += String.fromCharCode(bytes[i] + (bytes[i + 1] * 256))
  }
  return res
}

Buffer.prototype.slice = function slice (start, end) {
  var len = this.length
  start = ~~start
  end = end === undefined ? len : ~~end

  if (start < 0) {
    start += len
    if (start < 0) start = 0
  } else if (start > len) {
    start = len
  }

  if (end < 0) {
    end += len
    if (end < 0) end = 0
  } else if (end > len) {
    end = len
  }

  if (end < start) end = start

  var newBuf = this.subarray(start, end)
  // Return an augmented `Uint8Array` instance
  newBuf.__proto__ = Buffer.prototype
  return newBuf
}

/*
 * Need to make sure that buffer isn't trying to write out of bounds.
 */
function checkOffset (offset, ext, length) {
  if ((offset % 1) !== 0 || offset < 0) throw new RangeError('offset is not uint')
  if (offset + ext > length) throw new RangeError('Trying to access beyond buffer length')
}

Buffer.prototype.readUIntLE = function readUIntLE (offset, byteLength, noAssert) {
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) checkOffset(offset, byteLength, this.length)

  var val = this[offset]
  var mul = 1
  var i = 0
  while (++i < byteLength && (mul *= 0x100)) {
    val += this[offset + i] * mul
  }

  return val
}

Buffer.prototype.readUIntBE = function readUIntBE (offset, byteLength, noAssert) {
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) {
    checkOffset(offset, byteLength, this.length)
  }

  var val = this[offset + --byteLength]
  var mul = 1
  while (byteLength > 0 && (mul *= 0x100)) {
    val += this[offset + --byteLength] * mul
  }

  return val
}

Buffer.prototype.readUInt8 = function readUInt8 (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 1, this.length)
  return this[offset]
}

Buffer.prototype.readUInt16LE = function readUInt16LE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 2, this.length)
  return this[offset] | (this[offset + 1] << 8)
}

Buffer.prototype.readUInt16BE = function readUInt16BE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 2, this.length)
  return (this[offset] << 8) | this[offset + 1]
}

Buffer.prototype.readUInt32LE = function readUInt32LE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 4, this.length)

  return ((this[offset]) |
      (this[offset + 1] << 8) |
      (this[offset + 2] << 16)) +
      (this[offset + 3] * 0x1000000)
}

Buffer.prototype.readUInt32BE = function readUInt32BE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 4, this.length)

  return (this[offset] * 0x1000000) +
    ((this[offset + 1] << 16) |
    (this[offset + 2] << 8) |
    this[offset + 3])
}

Buffer.prototype.readIntLE = function readIntLE (offset, byteLength, noAssert) {
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) checkOffset(offset, byteLength, this.length)

  var val = this[offset]
  var mul = 1
  var i = 0
  while (++i < byteLength && (mul *= 0x100)) {
    val += this[offset + i] * mul
  }
  mul *= 0x80

  if (val >= mul) val -= Math.pow(2, 8 * byteLength)

  return val
}

Buffer.prototype.readIntBE = function readIntBE (offset, byteLength, noAssert) {
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) checkOffset(offset, byteLength, this.length)

  var i = byteLength
  var mul = 1
  var val = this[offset + --i]
  while (i > 0 && (mul *= 0x100)) {
    val += this[offset + --i] * mul
  }
  mul *= 0x80

  if (val >= mul) val -= Math.pow(2, 8 * byteLength)

  return val
}

Buffer.prototype.readInt8 = function readInt8 (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 1, this.length)
  if (!(this[offset] & 0x80)) return (this[offset])
  return ((0xff - this[offset] + 1) * -1)
}

Buffer.prototype.readInt16LE = function readInt16LE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 2, this.length)
  var val = this[offset] | (this[offset + 1] << 8)
  return (val & 0x8000) ? val | 0xFFFF0000 : val
}

Buffer.prototype.readInt16BE = function readInt16BE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 2, this.length)
  var val = this[offset + 1] | (this[offset] << 8)
  return (val & 0x8000) ? val | 0xFFFF0000 : val
}

Buffer.prototype.readInt32LE = function readInt32LE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 4, this.length)

  return (this[offset]) |
    (this[offset + 1] << 8) |
    (this[offset + 2] << 16) |
    (this[offset + 3] << 24)
}

Buffer.prototype.readInt32BE = function readInt32BE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 4, this.length)

  return (this[offset] << 24) |
    (this[offset + 1] << 16) |
    (this[offset + 2] << 8) |
    (this[offset + 3])
}

Buffer.prototype.readFloatLE = function readFloatLE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 4, this.length)
  return ieee754.read(this, offset, true, 23, 4)
}

Buffer.prototype.readFloatBE = function readFloatBE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 4, this.length)
  return ieee754.read(this, offset, false, 23, 4)
}

Buffer.prototype.readDoubleLE = function readDoubleLE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 8, this.length)
  return ieee754.read(this, offset, true, 52, 8)
}

Buffer.prototype.readDoubleBE = function readDoubleBE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 8, this.length)
  return ieee754.read(this, offset, false, 52, 8)
}

function checkInt (buf, value, offset, ext, max, min) {
  if (!Buffer.isBuffer(buf)) throw new TypeError('"buffer" argument must be a Buffer instance')
  if (value > max || value < min) throw new RangeError('"value" argument is out of bounds')
  if (offset + ext > buf.length) throw new RangeError('Index out of range')
}

Buffer.prototype.writeUIntLE = function writeUIntLE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) {
    var maxBytes = Math.pow(2, 8 * byteLength) - 1
    checkInt(this, value, offset, byteLength, maxBytes, 0)
  }

  var mul = 1
  var i = 0
  this[offset] = value & 0xFF
  while (++i < byteLength && (mul *= 0x100)) {
    this[offset + i] = (value / mul) & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeUIntBE = function writeUIntBE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) {
    var maxBytes = Math.pow(2, 8 * byteLength) - 1
    checkInt(this, value, offset, byteLength, maxBytes, 0)
  }

  var i = byteLength - 1
  var mul = 1
  this[offset + i] = value & 0xFF
  while (--i >= 0 && (mul *= 0x100)) {
    this[offset + i] = (value / mul) & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeUInt8 = function writeUInt8 (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 1, 0xff, 0)
  this[offset] = (value & 0xff)
  return offset + 1
}

Buffer.prototype.writeUInt16LE = function writeUInt16LE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 2, 0xffff, 0)
  this[offset] = (value & 0xff)
  this[offset + 1] = (value >>> 8)
  return offset + 2
}

Buffer.prototype.writeUInt16BE = function writeUInt16BE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 2, 0xffff, 0)
  this[offset] = (value >>> 8)
  this[offset + 1] = (value & 0xff)
  return offset + 2
}

Buffer.prototype.writeUInt32LE = function writeUInt32LE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 4, 0xffffffff, 0)
  this[offset + 3] = (value >>> 24)
  this[offset + 2] = (value >>> 16)
  this[offset + 1] = (value >>> 8)
  this[offset] = (value & 0xff)
  return offset + 4
}

Buffer.prototype.writeUInt32BE = function writeUInt32BE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 4, 0xffffffff, 0)
  this[offset] = (value >>> 24)
  this[offset + 1] = (value >>> 16)
  this[offset + 2] = (value >>> 8)
  this[offset + 3] = (value & 0xff)
  return offset + 4
}

Buffer.prototype.writeIntLE = function writeIntLE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) {
    var limit = Math.pow(2, (8 * byteLength) - 1)

    checkInt(this, value, offset, byteLength, limit - 1, -limit)
  }

  var i = 0
  var mul = 1
  var sub = 0
  this[offset] = value & 0xFF
  while (++i < byteLength && (mul *= 0x100)) {
    if (value < 0 && sub === 0 && this[offset + i - 1] !== 0) {
      sub = 1
    }
    this[offset + i] = ((value / mul) >> 0) - sub & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeIntBE = function writeIntBE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) {
    var limit = Math.pow(2, (8 * byteLength) - 1)

    checkInt(this, value, offset, byteLength, limit - 1, -limit)
  }

  var i = byteLength - 1
  var mul = 1
  var sub = 0
  this[offset + i] = value & 0xFF
  while (--i >= 0 && (mul *= 0x100)) {
    if (value < 0 && sub === 0 && this[offset + i + 1] !== 0) {
      sub = 1
    }
    this[offset + i] = ((value / mul) >> 0) - sub & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeInt8 = function writeInt8 (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 1, 0x7f, -0x80)
  if (value < 0) value = 0xff + value + 1
  this[offset] = (value & 0xff)
  return offset + 1
}

Buffer.prototype.writeInt16LE = function writeInt16LE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 2, 0x7fff, -0x8000)
  this[offset] = (value & 0xff)
  this[offset + 1] = (value >>> 8)
  return offset + 2
}

Buffer.prototype.writeInt16BE = function writeInt16BE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 2, 0x7fff, -0x8000)
  this[offset] = (value >>> 8)
  this[offset + 1] = (value & 0xff)
  return offset + 2
}

Buffer.prototype.writeInt32LE = function writeInt32LE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 4, 0x7fffffff, -0x80000000)
  this[offset] = (value & 0xff)
  this[offset + 1] = (value >>> 8)
  this[offset + 2] = (value >>> 16)
  this[offset + 3] = (value >>> 24)
  return offset + 4
}

Buffer.prototype.writeInt32BE = function writeInt32BE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 4, 0x7fffffff, -0x80000000)
  if (value < 0) value = 0xffffffff + value + 1
  this[offset] = (value >>> 24)
  this[offset + 1] = (value >>> 16)
  this[offset + 2] = (value >>> 8)
  this[offset + 3] = (value & 0xff)
  return offset + 4
}

function checkIEEE754 (buf, value, offset, ext, max, min) {
  if (offset + ext > buf.length) throw new RangeError('Index out of range')
  if (offset < 0) throw new RangeError('Index out of range')
}

function writeFloat (buf, value, offset, littleEndian, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) {
    checkIEEE754(buf, value, offset, 4, 3.4028234663852886e+38, -3.4028234663852886e+38)
  }
  ieee754.write(buf, value, offset, littleEndian, 23, 4)
  return offset + 4
}

Buffer.prototype.writeFloatLE = function writeFloatLE (value, offset, noAssert) {
  return writeFloat(this, value, offset, true, noAssert)
}

Buffer.prototype.writeFloatBE = function writeFloatBE (value, offset, noAssert) {
  return writeFloat(this, value, offset, false, noAssert)
}

function writeDouble (buf, value, offset, littleEndian, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) {
    checkIEEE754(buf, value, offset, 8, 1.7976931348623157E+308, -1.7976931348623157E+308)
  }
  ieee754.write(buf, value, offset, littleEndian, 52, 8)
  return offset + 8
}

Buffer.prototype.writeDoubleLE = function writeDoubleLE (value, offset, noAssert) {
  return writeDouble(this, value, offset, true, noAssert)
}

Buffer.prototype.writeDoubleBE = function writeDoubleBE (value, offset, noAssert) {
  return writeDouble(this, value, offset, false, noAssert)
}

// copy(targetBuffer, targetStart=0, sourceStart=0, sourceEnd=buffer.length)
Buffer.prototype.copy = function copy (target, targetStart, start, end) {
  if (!Buffer.isBuffer(target)) throw new TypeError('argument should be a Buffer')
  if (!start) start = 0
  if (!end && end !== 0) end = this.length
  if (targetStart >= target.length) targetStart = target.length
  if (!targetStart) targetStart = 0
  if (end > 0 && end < start) end = start

  // Copy 0 bytes; we're done
  if (end === start) return 0
  if (target.length === 0 || this.length === 0) return 0

  // Fatal error conditions
  if (targetStart < 0) {
    throw new RangeError('targetStart out of bounds')
  }
  if (start < 0 || start >= this.length) throw new RangeError('Index out of range')
  if (end < 0) throw new RangeError('sourceEnd out of bounds')

  // Are we oob?
  if (end > this.length) end = this.length
  if (target.length - targetStart < end - start) {
    end = target.length - targetStart + start
  }

  var len = end - start

  if (this === target && typeof Uint8Array.prototype.copyWithin === 'function') {
    // Use built-in when available, missing from IE11
    this.copyWithin(targetStart, start, end)
  } else if (this === target && start < targetStart && targetStart < end) {
    // descending copy from end
    for (var i = len - 1; i >= 0; --i) {
      target[i + targetStart] = this[i + start]
    }
  } else {
    Uint8Array.prototype.set.call(
      target,
      this.subarray(start, end),
      targetStart
    )
  }

  return len
}

// Usage:
//    buffer.fill(number[, offset[, end]])
//    buffer.fill(buffer[, offset[, end]])
//    buffer.fill(string[, offset[, end]][, encoding])
Buffer.prototype.fill = function fill (val, start, end, encoding) {
  // Handle string cases:
  if (typeof val === 'string') {
    if (typeof start === 'string') {
      encoding = start
      start = 0
      end = this.length
    } else if (typeof end === 'string') {
      encoding = end
      end = this.length
    }
    if (encoding !== undefined && typeof encoding !== 'string') {
      throw new TypeError('encoding must be a string')
    }
    if (typeof encoding === 'string' && !Buffer.isEncoding(encoding)) {
      throw new TypeError('Unknown encoding: ' + encoding)
    }
    if (val.length === 1) {
      var code = val.charCodeAt(0)
      if ((encoding === 'utf8' && code < 128) ||
          encoding === 'latin1') {
        // Fast path: If `val` fits into a single byte, use that numeric value.
        val = code
      }
    }
  } else if (typeof val === 'number') {
    val = val & 255
  }

  // Invalid ranges are not set to a default, so can range check early.
  if (start < 0 || this.length < start || this.length < end) {
    throw new RangeError('Out of range index')
  }

  if (end <= start) {
    return this
  }

  start = start >>> 0
  end = end === undefined ? this.length : end >>> 0

  if (!val) val = 0

  var i
  if (typeof val === 'number') {
    for (i = start; i < end; ++i) {
      this[i] = val
    }
  } else {
    var bytes = Buffer.isBuffer(val)
      ? val
      : new Buffer(val, encoding)
    var len = bytes.length
    if (len === 0) {
      throw new TypeError('The value "' + val +
        '" is invalid for argument "value"')
    }
    for (i = 0; i < end - start; ++i) {
      this[i + start] = bytes[i % len]
    }
  }

  return this
}

// HELPER FUNCTIONS
// ================

var INVALID_BASE64_RE = /[^+/0-9A-Za-z-_]/g

function base64clean (str) {
  // Node takes equal signs as end of the Base64 encoding
  str = str.split('=')[0]
  // Node strips out invalid characters like \n and \t from the string, base64-js does not
  str = str.trim().replace(INVALID_BASE64_RE, '')
  // Node converts strings with length < 2 to ''
  if (str.length < 2) return ''
  // Node allows for non-padded base64 strings (missing trailing ===), base64-js does not
  while (str.length % 4 !== 0) {
    str = str + '='
  }
  return str
}

function toHex (n) {
  if (n < 16) return '0' + n.toString(16)
  return n.toString(16)
}

function utf8ToBytes (string, units) {
  units = units || Infinity
  var codePoint
  var length = string.length
  var leadSurrogate = null
  var bytes = []

  for (var i = 0; i < length; ++i) {
    codePoint = string.charCodeAt(i)

    // is surrogate component
    if (codePoint > 0xD7FF && codePoint < 0xE000) {
      // last char was a lead
      if (!leadSurrogate) {
        // no lead yet
        if (codePoint > 0xDBFF) {
          // unexpected trail
          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
          continue
        } else if (i + 1 === length) {
          // unpaired lead
          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
          continue
        }

        // valid lead
        leadSurrogate = codePoint

        continue
      }

      // 2 leads in a row
      if (codePoint < 0xDC00) {
        if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
        leadSurrogate = codePoint
        continue
      }

      // valid surrogate pair
      codePoint = (leadSurrogate - 0xD800 << 10 | codePoint - 0xDC00) + 0x10000
    } else if (leadSurrogate) {
      // valid bmp char, but last char was a lead
      if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
    }

    leadSurrogate = null

    // encode utf8
    if (codePoint < 0x80) {
      if ((units -= 1) < 0) break
      bytes.push(codePoint)
    } else if (codePoint < 0x800) {
      if ((units -= 2) < 0) break
      bytes.push(
        codePoint >> 0x6 | 0xC0,
        codePoint & 0x3F | 0x80
      )
    } else if (codePoint < 0x10000) {
      if ((units -= 3) < 0) break
      bytes.push(
        codePoint >> 0xC | 0xE0,
        codePoint >> 0x6 & 0x3F | 0x80,
        codePoint & 0x3F | 0x80
      )
    } else if (codePoint < 0x110000) {
      if ((units -= 4) < 0) break
      bytes.push(
        codePoint >> 0x12 | 0xF0,
        codePoint >> 0xC & 0x3F | 0x80,
        codePoint >> 0x6 & 0x3F | 0x80,
        codePoint & 0x3F | 0x80
      )
    } else {
      throw new Error('Invalid code point')
    }
  }

  return bytes
}

function asciiToBytes (str) {
  var byteArray = []
  for (var i = 0; i < str.length; ++i) {
    // Node's code seems to be doing this and not & 0x7F..
    byteArray.push(str.charCodeAt(i) & 0xFF)
  }
  return byteArray
}

function utf16leToBytes (str, units) {
  var c, hi, lo
  var byteArray = []
  for (var i = 0; i < str.length; ++i) {
    if ((units -= 2) < 0) break

    c = str.charCodeAt(i)
    hi = c >> 8
    lo = c % 256
    byteArray.push(lo)
    byteArray.push(hi)
  }

  return byteArray
}

function base64ToBytes (str) {
  return base64.toByteArray(base64clean(str))
}

function blitBuffer (src, dst, offset, length) {
  for (var i = 0; i < length; ++i) {
    if ((i + offset >= dst.length) || (i >= src.length)) break
    dst[i + offset] = src[i]
  }
  return i
}

// ArrayBuffers from another context (i.e. an iframe) do not pass the `instanceof` check
// but they should be treated as valid. See: https://github.com/feross/buffer/issues/166
function isArrayBuffer (obj) {
  return obj instanceof ArrayBuffer ||
    (obj != null && obj.constructor != null && obj.constructor.name === 'ArrayBuffer' &&
      typeof obj.byteLength === 'number')
}

function numberIsNaN (obj) {
  return obj !== obj // eslint-disable-line no-self-compare
}

}).call(this,require("buffer").Buffer)
},{"base64-js":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/base64-js/index.js","buffer":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/buffer/index.js","ieee754":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/ieee754/index.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/bulk-write-stream/index.js":[function(require,module,exports){
var stream = require('readable-stream')
var inherits = require('inherits')
var bufferFrom = require('buffer-from')

var SIGNAL_FLUSH = bufferFrom([0])

var Bulk = function (opts, worker, flush) {
  if (!(this instanceof Bulk)) return new Bulk(opts, worker, flush)

  if (typeof opts === 'function') {
    flush = worker
    worker = opts
    opts = {}
  }

  stream.Writable.call(this, opts)
  this._worker = worker
  this._flush = flush
  this.destroyed = false
}

inherits(Bulk, stream.Writable)

Bulk.obj = function (opts, worker, flush) {
  if (typeof opts === 'function') return Bulk.obj(null, opts, worker)
  if (!opts) opts = {}
  opts.objectMode = true
  return new Bulk(opts, worker, flush)
}

Bulk.prototype.end = function (data, enc, cb) {
  if (!this._flush) return stream.Writable.prototype.end.apply(this, arguments)
  if (typeof data === 'function') return this.end(null, null, data)
  if (typeof enc === 'function') return this.end(data, null, enc)
  if (data) this.write(data)
  if (!this._writableState.ending) this.write(SIGNAL_FLUSH)
  return stream.Writable.prototype.end.call(this, cb)
}

Bulk.prototype.destroy = function (err) {
  if (this.destroyed) return
  this.destroyed = true
  if (err) this.emit('error')
  this.emit('close')
}

Bulk.prototype._write = function (data, enc, cb) {
  if (data === SIGNAL_FLUSH) this._flush(cb)
  else this._worker([data], cb)
}

Bulk.prototype._writev = function (batch, cb) {
  var len = batch.length
  if (batch[batch.length - 1].chunk === SIGNAL_FLUSH) {
    cb = this._flusher(cb)
    if (!--len) return cb()
  }
  var arr = new Array(len)
  for (var i = 0; i < len; i++) arr[i] = batch[i].chunk
  this._worker(arr, cb)
}

Bulk.prototype._flusher = function (cb) {
  var self = this
  return function (err) {
    if (err) return cb(err)
    self._flush(cb)
  }
}

module.exports = Bulk

},{"buffer-from":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/buffer-from/index.js","inherits":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/inherits/inherits_browser.js","readable-stream":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/readable-stream/readable-browser.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/codecs/index.js":[function(require,module,exports){
(function (Buffer){
module.exports = codecs

codecs.ascii = createString('ascii')
codecs.utf8 = createString('utf-8')
codecs.hex = createString('hex')
codecs.base64 = createString('base64')
codecs.ucs2 = createString('ucs2')
codecs.utf16le = createString('utf16le')
codecs.ndjson = createJSON(true)
codecs.json = createJSON(false)
codecs.binary = {
  encode: function encodeBinary (obj) {
    return typeof obj === 'string' ? Buffer.from(obj, 'utf-8') : obj
  },
  decode: function decodeBinary (buf) {
    return buf
  }
}

function codecs (fmt) {
  if (typeof fmt === 'object' && fmt && fmt.encode && fmt.decode) return fmt

  switch (fmt) {
    case 'ndjson': return codecs.ndjson
    case 'json': return codecs.json
    case 'ascii': return codecs.ascii
    case 'utf-8':
    case 'utf8': return codecs.utf8
    case 'hex': return codecs.hex
    case 'base64': return codecs.base64
    case 'ucs-2':
    case 'ucs2': return codecs.ucs2
    case 'utf16-le':
    case 'utf16le': return codecs.utf16le
  }

  return codecs.binary
}

function createJSON (newline) {
  return {
    encode: newline ? encodeNDJSON : encodeJSON,
    decode: function decodeJSON (buf) {
      return JSON.parse(buf.toString())
    }
  }

  function encodeJSON (val) {
    return Buffer.from(JSON.stringify(val))
  }

  function encodeNDJSON (val) {
    return Buffer.from(JSON.stringify(val) + '\n')
  }
}

function createString (type) {
  return {
    encode: function encodeString (val) {
      if (typeof val !== 'string') val = val.toString()
      return Buffer.from(val, type)
    },
    decode: function decodeString (buf) {
      return buf.toString(type)
    }
  }
}

}).call(this,require("buffer").Buffer)
},{"buffer":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/buffer/index.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/copy-text-to-clipboard/index.js":[function(require,module,exports){
'use strict';

const copyTextToClipboard = input => {
	const element = document.createElement('textarea');

	element.value = input;

	// Prevent keyboard from showing on mobile
	element.setAttribute('readonly', '');

	element.style.contain = 'strict';
	element.style.position = 'absolute';
	element.style.left = '-9999px';
	element.style.fontSize = '12pt'; // Prevent zooming on iOS

	const selection = document.getSelection();
	let originalRange = false;
	if (selection.rangeCount > 0) {
		originalRange = selection.getRangeAt(0);
	}

	document.body.append(element);
	element.select();

	// Explicit selection workaround for iOS
	element.selectionStart = 0;
	element.selectionEnd = input.length;

	let isSuccess = false;
	try {
		isSuccess = document.execCommand('copy');
	} catch (_) {}

	element.remove();

	if (originalRange) {
		selection.removeAllRanges();
		selection.addRange(originalRange);
	}

	return isSuccess;
};

module.exports = copyTextToClipboard;
// TODO: Remove this for the next major release
module.exports.default = copyTextToClipboard;

},{}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/core-util-is/lib/util.js":[function(require,module,exports){
(function (Buffer){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// NOTE: These type checking functions intentionally don't use `instanceof`
// because it is fragile and can be easily faked with `Object.create()`.

function isArray(arg) {
  if (Array.isArray) {
    return Array.isArray(arg);
  }
  return objectToString(arg) === '[object Array]';
}
exports.isArray = isArray;

function isBoolean(arg) {
  return typeof arg === 'boolean';
}
exports.isBoolean = isBoolean;

function isNull(arg) {
  return arg === null;
}
exports.isNull = isNull;

function isNullOrUndefined(arg) {
  return arg == null;
}
exports.isNullOrUndefined = isNullOrUndefined;

function isNumber(arg) {
  return typeof arg === 'number';
}
exports.isNumber = isNumber;

function isString(arg) {
  return typeof arg === 'string';
}
exports.isString = isString;

function isSymbol(arg) {
  return typeof arg === 'symbol';
}
exports.isSymbol = isSymbol;

function isUndefined(arg) {
  return arg === void 0;
}
exports.isUndefined = isUndefined;

function isRegExp(re) {
  return objectToString(re) === '[object RegExp]';
}
exports.isRegExp = isRegExp;

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}
exports.isObject = isObject;

function isDate(d) {
  return objectToString(d) === '[object Date]';
}
exports.isDate = isDate;

function isError(e) {
  return (objectToString(e) === '[object Error]' || e instanceof Error);
}
exports.isError = isError;

function isFunction(arg) {
  return typeof arg === 'function';
}
exports.isFunction = isFunction;

function isPrimitive(arg) {
  return arg === null ||
         typeof arg === 'boolean' ||
         typeof arg === 'number' ||
         typeof arg === 'string' ||
         typeof arg === 'symbol' ||  // ES6 symbol
         typeof arg === 'undefined';
}
exports.isPrimitive = isPrimitive;

exports.isBuffer = Buffer.isBuffer;

function objectToString(o) {
  return Object.prototype.toString.call(o);
}

}).call(this,{"isBuffer":require("../../is-buffer/index.js")})
},{"../../is-buffer/index.js":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/is-buffer/index.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/count-trailing-zeros/ctz.js":[function(require,module,exports){
module.exports = function(v) {
  var c = 32
  v &= -v
  if (v) c--
  if (v & 0x0000FFFF) c -= 16
  if (v & 0x00FF00FF) c -= 8
  if (v & 0x0F0F0F0F) c -= 4
  if (v & 0x33333333) c -= 2
  if (v & 0x55555555) c -= 1
  return c
}

},{}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/csjs-inject/csjs.js":[function(require,module,exports){
(function (global){
'use strict';

var csjs = require('csjs');
var insertCss = require('insert-css');

function csjsInserter() {
  var args = Array.prototype.slice.call(arguments);
  var result = csjs.apply(null, args);
  if (global.document) {
    insertCss(csjs.getCss(result));
  }
  return result;
}

module.exports = csjsInserter;

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"csjs":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/csjs/index.js","insert-css":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/insert-css/index.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/csjs-inject/get-css.js":[function(require,module,exports){
'use strict';

module.exports = require('csjs/get-css');

},{"csjs/get-css":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/csjs/get-css.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/csjs-inject/index.js":[function(require,module,exports){
'use strict';

var csjs = require('./csjs');

module.exports = csjs;
module.exports.csjs = csjs;
module.exports.getCss = require('./get-css');

},{"./csjs":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/csjs-inject/csjs.js","./get-css":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/csjs-inject/get-css.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/csjs/csjs.js":[function(require,module,exports){
'use strict';

module.exports = require('./lib/csjs');

},{"./lib/csjs":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/csjs/lib/csjs.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/csjs/get-css.js":[function(require,module,exports){
'use strict';

module.exports = require('./lib/get-css');

},{"./lib/get-css":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/csjs/lib/get-css.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/csjs/index.js":[function(require,module,exports){
'use strict';

var csjs = require('./csjs');

module.exports = csjs();
module.exports.csjs = csjs;
module.exports.noScope = csjs({ noscope: true });
module.exports.getCss = require('./get-css');

},{"./csjs":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/csjs/csjs.js","./get-css":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/csjs/get-css.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/csjs/lib/base62-encode.js":[function(require,module,exports){
'use strict';

/**
 * base62 encode implementation based on base62 module:
 * https://github.com/andrew/base62.js
 */

var CHARS = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

module.exports = function encode(integer) {
  if (integer === 0) {
    return '0';
  }
  var str = '';
  while (integer > 0) {
    str = CHARS[integer % 62] + str;
    integer = Math.floor(integer / 62);
  }
  return str;
};

},{}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/csjs/lib/build-exports.js":[function(require,module,exports){
'use strict';

var makeComposition = require('./composition').makeComposition;

module.exports = function createExports(classes, keyframes, compositions) {
  var keyframesObj = Object.keys(keyframes).reduce(function(acc, key) {
    var val = keyframes[key];
    acc[val] = makeComposition([key], [val], true);
    return acc;
  }, {});

  var exports = Object.keys(classes).reduce(function(acc, key) {
    var val = classes[key];
    var composition = compositions[key];
    var extended = composition ? getClassChain(composition) : [];
    var allClasses = [key].concat(extended);
    var unscoped = allClasses.map(function(name) {
      return classes[name] ? classes[name] : name;
    });
    acc[val] = makeComposition(allClasses, unscoped);
    return acc;
  }, keyframesObj);

  return exports;
}

function getClassChain(obj) {
  var visited = {}, acc = [];

  function traverse(obj) {
    return Object.keys(obj).forEach(function(key) {
      if (!visited[key]) {
        visited[key] = true;
        acc.push(key);
        traverse(obj[key]);
      }
    });
  }

  traverse(obj);
  return acc;
}

},{"./composition":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/csjs/lib/composition.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/csjs/lib/composition.js":[function(require,module,exports){
'use strict';

module.exports = {
  makeComposition: makeComposition,
  isComposition: isComposition,
  ignoreComposition: ignoreComposition
};

/**
 * Returns an immutable composition object containing the given class names
 * @param  {array} classNames - The input array of class names
 * @return {Composition}      - An immutable object that holds multiple
 *                              representations of the class composition
 */
function makeComposition(classNames, unscoped, isAnimation) {
  var classString = classNames.join(' ');
  return Object.create(Composition.prototype, {
    classNames: { // the original array of class names
      value: Object.freeze(classNames),
      configurable: false,
      writable: false,
      enumerable: true
    },
    unscoped: { // the original array of class names
      value: Object.freeze(unscoped),
      configurable: false,
      writable: false,
      enumerable: true
    },
    className: { // space-separated class string for use in HTML
      value: classString,
      configurable: false,
      writable: false,
      enumerable: true
    },
    selector: { // comma-separated, period-prefixed string for use in CSS
      value: classNames.map(function(name) {
        return isAnimation ? name : '.' + name;
      }).join(', '),
      configurable: false,
      writable: false,
      enumerable: true
    },
    toString: { // toString() method, returns class string for use in HTML
      value: function() {
        return classString;
      },
      configurable: false,
      writeable: false,
      enumerable: false
    }
  });
}

/**
 * Returns whether the input value is a Composition
 * @param value      - value to check
 * @return {boolean} - whether value is a Composition or not
 */
function isComposition(value) {
  return value instanceof Composition;
}

function ignoreComposition(values) {
  return values.reduce(function(acc, val) {
    if (isComposition(val)) {
      val.classNames.forEach(function(name, i) {
        acc[name] = val.unscoped[i];
      });
    }
    return acc;
  }, {});
}

/**
 * Private constructor for use in `instanceof` checks
 */
function Composition() {}

},{}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/csjs/lib/csjs.js":[function(require,module,exports){
'use strict';

var extractExtends = require('./css-extract-extends');
var composition = require('./composition');
var isComposition = composition.isComposition;
var ignoreComposition = composition.ignoreComposition;
var buildExports = require('./build-exports');
var scopify = require('./scopeify');
var cssKey = require('./css-key');
var extractExports = require('./extract-exports');

module.exports = function csjsTemplate(opts) {
  opts = (typeof opts === 'undefined') ? {} : opts;
  var noscope = (typeof opts.noscope === 'undefined') ? false : opts.noscope;

  return function csjsHandler(strings, values) {
    // Fast path to prevent arguments deopt
    var values = Array(arguments.length - 1);
    for (var i = 1; i < arguments.length; i++) {
      values[i - 1] = arguments[i];
    }
    var css = joiner(strings, values.map(selectorize));
    var ignores = ignoreComposition(values);

    var scope = noscope ? extractExports(css) : scopify(css, ignores);
    var extracted = extractExtends(scope.css);
    var localClasses = without(scope.classes, ignores);
    var localKeyframes = without(scope.keyframes, ignores);
    var compositions = extracted.compositions;

    var exports = buildExports(localClasses, localKeyframes, compositions);

    return Object.defineProperty(exports, cssKey, {
      enumerable: false,
      configurable: false,
      writeable: false,
      value: extracted.css
    });
  }
}

/**
 * Replaces class compositions with comma seperated class selectors
 * @param  value - the potential class composition
 * @return       - the original value or the selectorized class composition
 */
function selectorize(value) {
  return isComposition(value) ? value.selector : value;
}

/**
 * Joins template string literals and values
 * @param  {array} strings - array of strings
 * @param  {array} values  - array of values
 * @return {string}        - strings and values joined
 */
function joiner(strings, values) {
  return strings.map(function(str, i) {
    return (i !== values.length) ? str + values[i] : str;
  }).join('');
}

/**
 * Returns first object without keys of second
 * @param  {object} obj      - source object
 * @param  {object} unwanted - object with unwanted keys
 * @return {object}          - first object without unwanted keys
 */
function without(obj, unwanted) {
  return Object.keys(obj).reduce(function(acc, key) {
    if (!unwanted[key]) {
      acc[key] = obj[key];
    }
    return acc;
  }, {});
}

},{"./build-exports":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/csjs/lib/build-exports.js","./composition":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/csjs/lib/composition.js","./css-extract-extends":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/csjs/lib/css-extract-extends.js","./css-key":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/csjs/lib/css-key.js","./extract-exports":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/csjs/lib/extract-exports.js","./scopeify":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/csjs/lib/scopeify.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/csjs/lib/css-extract-extends.js":[function(require,module,exports){
'use strict';

var makeComposition = require('./composition').makeComposition;

var regex = /\.([^\s]+)(\s+)(extends\s+)(\.[^{]+)/g;

module.exports = function extractExtends(css) {
  var found, matches = [];
  while (found = regex.exec(css)) {
    matches.unshift(found);
  }

  function extractCompositions(acc, match) {
    var extendee = getClassName(match[1]);
    var keyword = match[3];
    var extended = match[4];

    // remove from output css
    var index = match.index + match[1].length + match[2].length;
    var len = keyword.length + extended.length;
    acc.css = acc.css.slice(0, index) + " " + acc.css.slice(index + len + 1);

    var extendedClasses = splitter(extended);

    extendedClasses.forEach(function(className) {
      if (!acc.compositions[extendee]) {
        acc.compositions[extendee] = {};
      }
      if (!acc.compositions[className]) {
        acc.compositions[className] = {};
      }
      acc.compositions[extendee][className] = acc.compositions[className];
    });
    return acc;
  }

  return matches.reduce(extractCompositions, {
    css: css,
    compositions: {}
  });

};

function splitter(match) {
  return match.split(',').map(getClassName);
}

function getClassName(str) {
  var trimmed = str.trim();
  return trimmed[0] === '.' ? trimmed.substr(1) : trimmed;
}

},{"./composition":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/csjs/lib/composition.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/csjs/lib/css-key.js":[function(require,module,exports){
'use strict';

/**
 * CSS identifiers with whitespace are invalid
 * Hence this key will not cause a collision
 */

module.exports = ' css ';

},{}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/csjs/lib/extract-exports.js":[function(require,module,exports){
'use strict';

var regex = require('./regex');
var classRegex = regex.classRegex;
var keyframesRegex = regex.keyframesRegex;

module.exports = extractExports;

function extractExports(css) {
  return {
    css: css,
    keyframes: getExport(css, keyframesRegex),
    classes: getExport(css, classRegex)
  };
}

function getExport(css, regex) {
  var prop = {};
  var match;
  while((match = regex.exec(css)) !== null) {
    var name = match[2];
    prop[name] = name;
  }
  return prop;
}

},{"./regex":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/csjs/lib/regex.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/csjs/lib/get-css.js":[function(require,module,exports){
'use strict';

var cssKey = require('./css-key');

module.exports = function getCss(csjs) {
  return csjs[cssKey];
};

},{"./css-key":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/csjs/lib/css-key.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/csjs/lib/hash-string.js":[function(require,module,exports){
'use strict';

/**
 * djb2 string hash implementation based on string-hash module:
 * https://github.com/darkskyapp/string-hash
 */

module.exports = function hashStr(str) {
  var hash = 5381;
  var i = str.length;

  while (i) {
    hash = (hash * 33) ^ str.charCodeAt(--i)
  }
  return hash >>> 0;
};

},{}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/csjs/lib/regex.js":[function(require,module,exports){
'use strict';

var findClasses = /(\.)(?!\d)([^\s\.,{\[>+~#:)]*)(?![^{]*})/.source;
var findKeyframes = /(@\S*keyframes\s*)([^{\s]*)/.source;
var ignoreComments = /(?!(?:[^*/]|\*[^/]|\/[^*])*\*+\/)/.source;

var classRegex = new RegExp(findClasses + ignoreComments, 'g');
var keyframesRegex = new RegExp(findKeyframes + ignoreComments, 'g');

module.exports = {
  classRegex: classRegex,
  keyframesRegex: keyframesRegex,
  ignoreComments: ignoreComments,
};

},{}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/csjs/lib/replace-animations.js":[function(require,module,exports){
var ignoreComments = require('./regex').ignoreComments;

module.exports = replaceAnimations;

function replaceAnimations(result) {
  var animations = Object.keys(result.keyframes).reduce(function(acc, key) {
    acc[result.keyframes[key]] = key;
    return acc;
  }, {});
  var unscoped = Object.keys(animations);

  if (unscoped.length) {
    var regexStr = '((?:animation|animation-name)\\s*:[^};]*)('
      + unscoped.join('|') + ')([;\\s])' + ignoreComments;
    var regex = new RegExp(regexStr, 'g');

    var replaced = result.css.replace(regex, function(match, preamble, name, ending) {
      return preamble + animations[name] + ending;
    });

    return {
      css: replaced,
      keyframes: result.keyframes,
      classes: result.classes
    }
  }

  return result;
}

},{"./regex":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/csjs/lib/regex.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/csjs/lib/scoped-name.js":[function(require,module,exports){
'use strict';

var encode = require('./base62-encode');
var hash = require('./hash-string');

module.exports = function fileScoper(fileSrc) {
  var suffix = encode(hash(fileSrc));

  return function scopedName(name) {
    return name + '_' + suffix;
  }
};

},{"./base62-encode":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/csjs/lib/base62-encode.js","./hash-string":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/csjs/lib/hash-string.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/csjs/lib/scopeify.js":[function(require,module,exports){
'use strict';

var fileScoper = require('./scoped-name');
var replaceAnimations = require('./replace-animations');
var regex = require('./regex');
var classRegex = regex.classRegex;
var keyframesRegex = regex.keyframesRegex;

module.exports = scopify;

function scopify(css, ignores) {
  var makeScopedName = fileScoper(css);
  var replacers = {
    classes: classRegex,
    keyframes: keyframesRegex
  };

  function scopeCss(result, key) {
    var replacer = replacers[key];
    function replaceFn(fullMatch, prefix, name) {
      var scopedName = ignores[name] ? name : makeScopedName(name);
      result[key][scopedName] = name;
      return prefix + scopedName;
    }
    return {
      css: result.css.replace(replacer, replaceFn),
      keyframes: result.keyframes,
      classes: result.classes
    };
  }

  var result = Object.keys(replacers).reduce(scopeCss, {
    css: css,
    keyframes: {},
    classes: {}
  });

  return replaceAnimations(result);
}

},{"./regex":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/csjs/lib/regex.js","./replace-animations":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/csjs/lib/replace-animations.js","./scoped-name":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/csjs/lib/scoped-name.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/duplexify/index.js":[function(require,module,exports){
(function (process,Buffer){
var stream = require('readable-stream')
var eos = require('end-of-stream')
var inherits = require('inherits')
var shift = require('stream-shift')

var SIGNAL_FLUSH = (Buffer.from && Buffer.from !== Uint8Array.from)
  ? Buffer.from([0])
  : new Buffer([0])

var onuncork = function(self, fn) {
  if (self._corked) self.once('uncork', fn)
  else fn()
}

var autoDestroy = function (self, err) {
  if (self._autoDestroy) self.destroy(err)
}

var destroyer = function(self, end) {
  return function(err) {
    if (err) autoDestroy(self, err.message === 'premature close' ? null : err)
    else if (end && !self._ended) self.end()
  }
}

var end = function(ws, fn) {
  if (!ws) return fn()
  if (ws._writableState && ws._writableState.finished) return fn()
  if (ws._writableState) return ws.end(fn)
  ws.end()
  fn()
}

var toStreams2 = function(rs) {
  return new (stream.Readable)({objectMode:true, highWaterMark:16}).wrap(rs)
}

var Duplexify = function(writable, readable, opts) {
  if (!(this instanceof Duplexify)) return new Duplexify(writable, readable, opts)
  stream.Duplex.call(this, opts)

  this._writable = null
  this._readable = null
  this._readable2 = null

  this._autoDestroy = !opts || opts.autoDestroy !== false
  this._forwardDestroy = !opts || opts.destroy !== false
  this._forwardEnd = !opts || opts.end !== false
  this._corked = 1 // start corked
  this._ondrain = null
  this._drained = false
  this._forwarding = false
  this._unwrite = null
  this._unread = null
  this._ended = false

  this.destroyed = false

  if (writable) this.setWritable(writable)
  if (readable) this.setReadable(readable)
}

inherits(Duplexify, stream.Duplex)

Duplexify.obj = function(writable, readable, opts) {
  if (!opts) opts = {}
  opts.objectMode = true
  opts.highWaterMark = 16
  return new Duplexify(writable, readable, opts)
}

Duplexify.prototype.cork = function() {
  if (++this._corked === 1) this.emit('cork')
}

Duplexify.prototype.uncork = function() {
  if (this._corked && --this._corked === 0) this.emit('uncork')
}

Duplexify.prototype.setWritable = function(writable) {
  if (this._unwrite) this._unwrite()

  if (this.destroyed) {
    if (writable && writable.destroy) writable.destroy()
    return
  }

  if (writable === null || writable === false) {
    this.end()
    return
  }

  var self = this
  var unend = eos(writable, {writable:true, readable:false}, destroyer(this, this._forwardEnd))

  var ondrain = function() {
    var ondrain = self._ondrain
    self._ondrain = null
    if (ondrain) ondrain()
  }

  var clear = function() {
    self._writable.removeListener('drain', ondrain)
    unend()
  }

  if (this._unwrite) process.nextTick(ondrain) // force a drain on stream reset to avoid livelocks

  this._writable = writable
  this._writable.on('drain', ondrain)
  this._unwrite = clear

  this.uncork() // always uncork setWritable
}

Duplexify.prototype.setReadable = function(readable) {
  if (this._unread) this._unread()

  if (this.destroyed) {
    if (readable && readable.destroy) readable.destroy()
    return
  }

  if (readable === null || readable === false) {
    this.push(null)
    this.resume()
    return
  }

  var self = this
  var unend = eos(readable, {writable:false, readable:true}, destroyer(this))

  var onreadable = function() {
    self._forward()
  }

  var onend = function() {
    self.push(null)
  }

  var clear = function() {
    self._readable2.removeListener('readable', onreadable)
    self._readable2.removeListener('end', onend)
    unend()
  }

  this._drained = true
  this._readable = readable
  this._readable2 = readable._readableState ? readable : toStreams2(readable)
  this._readable2.on('readable', onreadable)
  this._readable2.on('end', onend)
  this._unread = clear

  this._forward()
}

Duplexify.prototype._read = function() {
  this._drained = true
  this._forward()
}

Duplexify.prototype._forward = function() {
  if (this._forwarding || !this._readable2 || !this._drained) return
  this._forwarding = true

  var data

  while (this._drained && (data = shift(this._readable2)) !== null) {
    if (this.destroyed) continue
    this._drained = this.push(data)
  }

  this._forwarding = false
}

Duplexify.prototype.destroy = function(err) {
  if (this.destroyed) return
  this.destroyed = true

  var self = this
  process.nextTick(function() {
    self._destroy(err)
  })
}

Duplexify.prototype._destroy = function(err) {
  if (err) {
    var ondrain = this._ondrain
    this._ondrain = null
    if (ondrain) ondrain(err)
    else this.emit('error', err)
  }

  if (this._forwardDestroy) {
    if (this._readable && this._readable.destroy) this._readable.destroy()
    if (this._writable && this._writable.destroy) this._writable.destroy()
  }

  this.emit('close')
}

Duplexify.prototype._write = function(data, enc, cb) {
  if (this.destroyed) return cb()
  if (this._corked) return onuncork(this, this._write.bind(this, data, enc, cb))
  if (data === SIGNAL_FLUSH) return this._finish(cb)
  if (!this._writable) return cb()

  if (this._writable.write(data) === false) this._ondrain = cb
  else cb()
}

Duplexify.prototype._finish = function(cb) {
  var self = this
  this.emit('preend')
  onuncork(this, function() {
    end(self._forwardEnd && self._writable, function() {
      // haxx to not emit prefinish twice
      if (self._writableState.prefinished === false) self._writableState.prefinished = true
      self.emit('prefinish')
      onuncork(self, cb)
    })
  })
}

Duplexify.prototype.end = function(data, enc, cb) {
  if (typeof data === 'function') return this.end(null, null, data)
  if (typeof enc === 'function') return this.end(data, null, enc)
  this._ended = true
  if (data) this.write(data)
  if (!this._writableState.ending) this.write(SIGNAL_FLUSH)
  return stream.Writable.prototype.end.call(this, cb)
}

module.exports = Duplexify

}).call(this,require('_process'),require("buffer").Buffer)
},{"_process":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/process/browser.js","buffer":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/buffer/index.js","end-of-stream":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/end-of-stream/index.js","inherits":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/inherits/inherits_browser.js","readable-stream":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/readable-stream/readable-browser.js","stream-shift":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/stream-shift/index.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/end-of-stream/index.js":[function(require,module,exports){
(function (process){
var once = require('once');

var noop = function() {};

var isRequest = function(stream) {
	return stream.setHeader && typeof stream.abort === 'function';
};

var isChildProcess = function(stream) {
	return stream.stdio && Array.isArray(stream.stdio) && stream.stdio.length === 3
};

var eos = function(stream, opts, callback) {
	if (typeof opts === 'function') return eos(stream, null, opts);
	if (!opts) opts = {};

	callback = once(callback || noop);

	var ws = stream._writableState;
	var rs = stream._readableState;
	var readable = opts.readable || (opts.readable !== false && stream.readable);
	var writable = opts.writable || (opts.writable !== false && stream.writable);
	var cancelled = false;

	var onlegacyfinish = function() {
		if (!stream.writable) onfinish();
	};

	var onfinish = function() {
		writable = false;
		if (!readable) callback.call(stream);
	};

	var onend = function() {
		readable = false;
		if (!writable) callback.call(stream);
	};

	var onexit = function(exitCode) {
		callback.call(stream, exitCode ? new Error('exited with error code: ' + exitCode) : null);
	};

	var onerror = function(err) {
		callback.call(stream, err);
	};

	var onclose = function() {
		process.nextTick(onclosenexttick);
	};

	var onclosenexttick = function() {
		if (cancelled) return;
		if (readable && !(rs && (rs.ended && !rs.destroyed))) return callback.call(stream, new Error('premature close'));
		if (writable && !(ws && (ws.ended && !ws.destroyed))) return callback.call(stream, new Error('premature close'));
	};

	var onrequest = function() {
		stream.req.on('finish', onfinish);
	};

	if (isRequest(stream)) {
		stream.on('complete', onfinish);
		stream.on('abort', onclose);
		if (stream.req) onrequest();
		else stream.on('request', onrequest);
	} else if (writable && !ws) { // legacy streams
		stream.on('end', onlegacyfinish);
		stream.on('close', onlegacyfinish);
	}

	if (isChildProcess(stream)) stream.on('exit', onexit);

	stream.on('end', onend);
	stream.on('finish', onfinish);
	if (opts.error !== false) stream.on('error', onerror);
	stream.on('close', onclose);

	return function() {
		cancelled = true;
		stream.removeListener('complete', onfinish);
		stream.removeListener('abort', onclose);
		stream.removeListener('request', onrequest);
		if (stream.req) stream.req.removeListener('finish', onfinish);
		stream.removeListener('end', onlegacyfinish);
		stream.removeListener('close', onlegacyfinish);
		stream.removeListener('finish', onfinish);
		stream.removeListener('exit', onexit);
		stream.removeListener('end', onend);
		stream.removeListener('error', onerror);
		stream.removeListener('close', onclose);
	};
};

module.exports = eos;

}).call(this,require('_process'))
},{"_process":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/process/browser.js","once":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/once/once.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/fast-bitfield/index.js":[function(require,module,exports){
'use strict'

const ctz = require('count-trailing-zeros')

module.exports = () => new Bitfield()

class Page {
  constructor (level) {
    const buf = new Uint8Array(level ? 8456 : 4360)
    const b = buf.byteOffset

    this.buffer = buf
    this.bits = level ? null : new Uint32Array(buf.buffer, b, 1024)
    this.children = level ? new Array(32768) : null
    this.level = level

    this.allOne = level
      ? [
        new Uint32Array(buf.buffer, b, 1024),
        new Uint32Array(buf.buffer, b + 4096, 32),
        new Uint32Array(buf.buffer, b + 4224, 1)
      ]
      : [
        this.bits,
        new Uint32Array(buf.buffer, b + 4096, 32),
        new Uint32Array(buf.buffer, b + 4224, 1)
      ]

    this.oneOne = level
      ? [
        new Uint32Array(buf.buffer, b + 4228, 1024),
        new Uint32Array(buf.buffer, b + 8324, 32),
        new Uint32Array(buf.buffer, b + 8452, 1)
      ]
      : [
        this.bits,
        new Uint32Array(buf.buffer, b + 4228, 32),
        new Uint32Array(buf.buffer, b + 4356, 1)
      ]
  }
}

const ZEROS = [new Page(0), new Page(1), new Page(2), new Page(3)]
const MASK = new Uint32Array(32)
const MASK_INCL = new Uint32Array(32)

for (var i = 0; i < 32; i++) {
  MASK[i] = Math.pow(2, 31 - i) - 1
  MASK_INCL[i] = Math.pow(2, 32 - i) - 1
}

const LITTLE_ENDIAN = new Uint8Array(MASK.buffer, MASK.byteOffset, 1)[0] === 0xff

class Bitfield {
  constructor () {
    this.length = 32768
    this.littleEndian = LITTLE_ENDIAN

    this._path = new Uint16Array(5)
    this._offsets = new Uint16Array(this._path.buffer, this._path.byteOffset + 2, 4)
    this._parents = new Array(4).fill(null)
    this._page = new Page(0)
    this._allocs = 1
  }

  last () {
    var page = this._page
    var b = 0

    while (true) {
      for (var i = 2; i >= 0; i--) {
        const c = ctz(page.oneOne[i][b])
        if (c === 32) return -1
        b = (b << 5) + (31 - c)
      }

      this._path[page.level] = b
      if (!page.level) return defactor(this._path)
      page = page.children[b]
      b = 0
    }
  }

  set (index, bit) {
    const page = this._getPage(index, bit)
    if (!page) return false

    const i = this._path[0]
    const r = i & 31
    const b = i >>> 5
    const prev = page.bits[b]

    page.bits[b] = bit
      ? (prev | (0x80000000 >>> r))
      : (prev & ~(0x80000000 >>> r))

    const upd = page.bits[b]
    if (upd === prev) return false

    this._updateAllOne(page, b, upd)
    this._updateOneOne(page, b, upd)

    return true
  }

  get (index) {
    const page = this._getPage(index, false)
    if (!page) return false

    const i = this._path[0]
    const r = i & 31

    return (page.bits[i >>> 5] & (0x80000000 >>> r)) !== 0
  }

  iterator () {
    return new Iterator(this)
  }

  fill (val, start, end) {
    if (!start) start = 0
    if (val === true) return this._fillBit(true, start, end === 0 ? end : (end || this.length))
    if (val === false) return this._fillBit(false, start, end === 0 ? end : (end || this.length))
    this._fillBuffer(val, start, end === 0 ? end : (end || (start + 8 * val.length)))
  }

  grow () {
    if (this._page.level === 3) throw new Error('Cannot grow beyond ' + this.length)
    const page = this._page
    this._page = new Page(page.level + 1)
    this._page.children[0] = page
    if (this._page.level === 3) this.length = Number.MAX_SAFE_INTEGER
    else this.length *= 32768
  }

  _fillBuffer (buf, start, end) {
    if ((start & 7) || (end & 7)) throw new Error('Offsets must be a multiple of 8')

    start /= 8
    while (end > this.length) this.grow()
    end /= 8

    const offset = start
    var page = this._getPage(8 * start, true)

    while (start < end) {
      const delta = end - start < 4096 ? end - start : 4096
      const s = start - offset

      start += this._setPageBuffer(page, buf.subarray(s, s + delta), start & 1023)
      if (start !== end) page = this._nextPage(page, 8 * start)
    }
  }

  _fillBit (bit, start, end) {
    var page = this._getPage(start, bit)

    // TODO: this can be optimised a lot in the case of end - start > 32768
    // in that case clear levels of 32768 ** 2 instead etc

    while (start < end) {
      const delta = end - start < 32768 ? end - start : 32768
      start += this._setPageBits(page, bit, start & 32767, delta)
      if (start !== end) page = this._nextPage(page, start)
    }
  }

  _nextPage (page, start) {
    const i = ++this._offsets[page.level]
    return i === 32768
      ? this._getPage(start, true)
      : this._parents[page.level].children[i] || this._addPage(this._parents[page.level], i)
  }

  _setPageBuffer (page, buf, start) {
    new Uint8Array(page.bits.buffer, page.bits.byteOffset, page.bits.length * 4).set(buf, start)
    start >>>= 2
    this._update(page, start, start + (buf.length >>> 2) + (buf.length & 3 ? 1 : 0))
    return buf.length
  }

  _setPageBits (page, bit, start, end) {
    const s = start >>> 5
    const e = end >>> 5
    const sm = 0xffffffff >>> (start & 31)
    const em = ~(0xffffffff >>> (end & 31))

    if (s === e) {
      page.bits[s] = bit
        ? page.bits[s] | (sm & em)
        : page.bits[s] & ~(sm & em)
      this._update(page, s, s + 1)
      return end - start
    }

    page.bits[s] = bit
      ? page.bits[s] | sm
      : page.bits[s] & (~sm)

    if (e - s > 2) page.bits.fill(bit ? 0xffffffff : 0, s + 1, e - 1)

    if (e === 1024) {
      page.bits[e - 1] = bit ? 0xffffffff : 0
      this._update(page, s, e)
      return end - start
    }

    page.bits[e] = bit
      ? page.bits[e] | em
      : page.bits[e] & (~em)

    this._update(page, s, e + 1)
    return end - start
  }

  _update (page, start, end) {
    for (; start < end; start++) {
      const upd = page.bits[start]
      this._updateAllOne(page, start, upd)
      this._updateOneOne(page, start, upd)
    }
  }

  _updateAllOne (page, b, upd) {
    var i = 1

    do {
      for (; i < 3; i++) {
        const buf = page.allOne[i]
        const r = b & 31
        const prev = buf[b >>>= 5]
        buf[b] = upd === 0xffffffff
          ? (prev | (0x80000000 >>> r))
          : (prev & ~(0x80000000 >>> r))
        upd = buf[b]
        if (upd === prev) return
      }

      b += this._offsets[page.level]
      page = this._parents[page.level]
      i = 0
    } while (page)
  }

  _updateOneOne (page, b, upd) {
    var i = 1

    do {
      for (; i < 3; i++) {
        const buf = page.oneOne[i]
        const r = b & 31
        const prev = buf[b >>>= 5]
        buf[b] = upd !== 0
          ? (prev | (0x80000000 >>> r))
          : (prev & ~(0x80000000 >>> r))
        upd = buf[b]
        if (upd === prev) return
      }

      b += this._offsets[page.level]
      page = this._parents[page.level]
      i = 0

      if (upd === 0 && page) {
        // all zeros, non root -> free page
        page.children[this._offsets[page.level - 1]] = undefined
      }
    } while (page)
  }

  _getPage (index, createIfMissing) {
    factor(index, this._path)

    while (index >= this.length) {
      if (!createIfMissing) return null
      this.grow()
    }

    var page = this._page

    for (var i = page.level; i > 0 && page; i--) {
      const p = this._path[i]
      this._parents[i - 1] = page
      page = page.children[p] || (createIfMissing ? this._addPage(page, p) : null)
    }

    return page
  }

  _addPage (page, i) {
    this._allocs++
    page = page.children[i] = new Page(page.level - 1)
    return page
  }
}

class Iterator {
  constructor (bitfield) {
    this._bitfield = bitfield
    this._path = new Uint16Array(5)
    this._offsets = new Uint16Array(this._path.buffer, this._path.byteOffset + 2, 4)
    this._parents = new Array(4).fill(null)
    this._page = null
    this._allocs = bitfield._allocs

    this.seek(0)
  }

  seek (index) {
    this._allocs = this._bitfield._allocs

    if (index >= this._bitfield.length) {
      this._page = null
      return this
    }

    factor(index, this._path)

    this._page = this._bitfield._page
    for (var i = this._page.level; i > 0; i--) {
      this._parents[i - 1] = this._page
      this._page = this._page.children[this._path[i]] || ZEROS[i - 1]
    }

    return this
  }

  next (bit) {
    return bit ? this.nextTrue() : this.nextFalse()
  }

  nextFalse () {
    if (this._allocs !== this._bitfield._allocs) {
      // If a page has been alloced while we are iterating
      // and we have a zero page in our path we need to reseek
      // in case that page has been overwritten
      this.seek(defactor(this._path))
    }

    var page = this._page
    var b = this._path[0]
    var mask = MASK_INCL

    while (page) {
      for (var i = 0; i < 3; i++) {
        const r = b & 31
        const clz = Math.clz32((~page.allOne[i][b >>>= 5]) & mask[r])
        if (clz !== 32) return this._downLeftFalse(page, i, b, clz)
        mask = MASK
      }

      b = this._offsets[page.level]
      page = this._parents[page.level]
    }

    return -1
  }

  _downLeftFalse (page, i, b, clz) {
    while (true) {
      while (i) {
        b = (b << 5) + clz
        clz = Math.clz32(~page.allOne[--i][b])
      }

      b = (b << 5) + clz

      if (!page.level) break

      this._parents[page.level - 1] = page
      this._path[page.level] = b

      page = page.children[b]
      i = 3
      clz = b = 0
    }

    this._page = page
    this._path[0] = b

    return this._inc()
  }

  nextTrue () {
    var page = this._page
    var b = this._path[0]
    var mask = MASK_INCL

    while (page) {
      for (var i = 0; i < 3; i++) {
        const r = b & 31
        const clz = Math.clz32(page.oneOne[i][b >>>= 5] & mask[r])
        if (clz !== 32) return this._downLeftTrue(page, i, b, clz)
        mask = MASK
      }

      b = this._offsets[page.level]
      page = this._parents[page.level]
    }

    return -1
  }

  _downLeftTrue (page, i, b, clz) {
    while (true) {
      while (i) {
        b = (b << 5) + clz
        clz = Math.clz32(page.oneOne[--i][b])
      }

      b = (b << 5) + clz

      if (!page.level) break

      this._parents[page.level - 1] = page
      this._path[page.level] = b

      page = page.children[b]
      i = 3
      clz = b = 0
    }

    this._page = page
    this._path[0] = b

    return this._inc()
  }

  _inc () {
    const n = defactor(this._path)
    if (this._path[0] < 32767) this._path[0]++
    else this.seek(n + 1)
    return n
  }
}

function defactor (out) {
  return ((((out[3] * 32768 + out[2]) * 32768) + out[1]) * 32768) + out[0]
}

function factor (n, out) {
  n = (n - (out[0] = (n & 32767))) / 32768
  n = (n - (out[1] = (n & 32767))) / 32768
  out[3] = ((n - (out[2] = (n & 32767))) / 32768) & 32767
}

},{"count-trailing-zeros":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/count-trailing-zeros/ctz.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/flat-tree/index.js":[function(require,module,exports){
exports.fullRoots = function (index, result) {
  if (index & 1) throw new Error('You can only look up roots for depth(0) blocks')
  if (!result) result = []

  index /= 2

  var offset = 0
  var factor = 1

  while (true) {
    if (!index) return result
    while (factor * 2 <= index) factor *= 2
    result.push(offset + factor - 1)
    offset = offset + 2 * factor
    index -= factor
    factor = 1
  }
}

exports.depth = function (index) {
  var depth = 0

  index += 1
  while (!(index & 1)) {
    depth++
    index = rightShift(index)
  }

  return depth
}

exports.sibling = function (index, depth) {
  if (!depth) depth = exports.depth(index)
  var offset = exports.offset(index, depth)

  return exports.index(depth, offset & 1 ? offset - 1 : offset + 1)
}

exports.parent = function (index, depth) {
  if (!depth) depth = exports.depth(index)
  var offset = exports.offset(index, depth)

  return exports.index(depth + 1, rightShift(offset))
}

exports.leftChild = function (index, depth) {
  if (!(index & 1)) return -1
  if (!depth) depth = exports.depth(index)
  return exports.index(depth - 1, exports.offset(index, depth) * 2)
}

exports.rightChild = function (index, depth) {
  if (!(index & 1)) return -1
  if (!depth) depth = exports.depth(index)
  return exports.index(depth - 1, 1 + (exports.offset(index, depth) * 2))
}

exports.children = function (index, depth) {
  if (!(index & 1)) return null

  if (!depth) depth = exports.depth(index)
  var offset = exports.offset(index, depth) * 2

  return [
    exports.index(depth - 1, offset),
    exports.index(depth - 1, offset + 1)
  ]
}

exports.leftSpan = function (index, depth) {
  if (!(index & 1)) return index
  if (!depth) depth = exports.depth(index)
  return exports.offset(index, depth) * twoPow(depth + 1)
}

exports.rightSpan = function (index, depth) {
  if (!(index & 1)) return index
  if (!depth) depth = exports.depth(index)
  return (exports.offset(index, depth) + 1) * twoPow(depth + 1) - 2
}

exports.count = function (index, depth) {
  if (!(index & 1)) return 1
  if (!depth) depth = exports.depth(index)
  return twoPow(depth + 1) - 1
}

exports.spans = function (index, depth) {
  if (!(index & 1)) return [index, index]
  if (!depth) depth = exports.depth(index)

  var offset = exports.offset(index, depth)
  var width = twoPow(depth + 1)

  return [offset * width, (offset + 1) * width - 2]
}

exports.index = function (depth, offset) {
  return (1 + 2 * offset) * twoPow(depth) - 1
}

exports.offset = function (index, depth) {
  if (!(index & 1)) return index / 2
  if (!depth) depth = exports.depth(index)

  return ((index + 1) / twoPow(depth) - 1) / 2
}

exports.iterator = function (index) {
  var ite = new Iterator()
  ite.seek(index || 0)
  return ite
}

function twoPow (n) {
  return n < 31 ? 1 << n : ((1 << 30) * (1 << (n - 30)))
}

function rightShift (n) {
  return (n - (n & 1)) / 2
}

function Iterator (index) {
  this.index = 0
  this.offset = 0
  this.factor = 0
}

Iterator.prototype.seek = function (index) {
  this.index = index
  if (this.index & 1) {
    this.offset = exports.offset(index)
    this.factor = twoPow(exports.depth(index) + 1)
  } else {
    this.offset = index / 2
    this.factor = 2
  }
}

Iterator.prototype.isLeft = function () {
  return !(this.offset & 1)
}

Iterator.prototype.isRight = function () {
  return !this.isLeft()
}

Iterator.prototype.prev = function () {
  if (!this.offset) return this.index
  this.offset--
  this.index -= this.factor
  return this.index
}

Iterator.prototype.next = function () {
  this.offset++
  this.index += this.factor
  return this.index
}

Iterator.prototype.sibling = function () {
  return this.isLeft() ? this.next() : this.prev()
}

Iterator.prototype.parent = function () {
  if (this.offset & 1) {
    this.index -= this.factor / 2
    this.offset = (this.offset - 1) / 2
  } else {
    this.index += this.factor / 2
    this.offset /= 2
  }
  this.factor *= 2
  return this.index
}

Iterator.prototype.leftSpan = function () {
  this.index = this.index - this.factor / 2 + 1
  this.offset = this.index / 2
  this.factor = 2
  return this.index
}

Iterator.prototype.rightSpan = function () {
  this.index = this.index + this.factor / 2 - 1
  this.offset = this.index / 2
  this.factor = 2
  return this.index
}

Iterator.prototype.leftChild = function () {
  if (this.factor === 2) return this.index
  this.factor /= 2
  this.index -= this.factor / 2
  this.offset *= 2
  return this.index
}

Iterator.prototype.rightChild = function () {
  if (this.factor === 2) return this.index
  this.factor /= 2
  this.index += this.factor / 2
  this.offset = 2 * this.offset + 1
  return this.index
}

},{}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/from2/index.js":[function(require,module,exports){
(function (process){
var Readable = require('readable-stream').Readable
var inherits = require('inherits')

module.exports = from2

from2.ctor = ctor
from2.obj = obj

var Proto = ctor()

function toFunction(list) {
  list = list.slice()
  return function (_, cb) {
    var err = null
    var item = list.length ? list.shift() : null
    if (item instanceof Error) {
      err = item
      item = null
    }

    cb(err, item)
  }
}

function from2(opts, read) {
  if (typeof opts !== 'object' || Array.isArray(opts)) {
    read = opts
    opts = {}
  }

  var rs = new Proto(opts)
  rs._from = Array.isArray(read) ? toFunction(read) : (read || noop)
  return rs
}

function ctor(opts, read) {
  if (typeof opts === 'function') {
    read = opts
    opts = {}
  }

  opts = defaults(opts)

  inherits(Class, Readable)
  function Class(override) {
    if (!(this instanceof Class)) return new Class(override)
    this._reading = false
    this._callback = check
    this.destroyed = false
    Readable.call(this, override || opts)

    var self = this
    var hwm = this._readableState.highWaterMark

    function check(err, data) {
      if (self.destroyed) return
      if (err) return self.destroy(err)
      if (data === null) return self.push(null)
      self._reading = false
      if (self.push(data)) self._read(hwm)
    }
  }

  Class.prototype._from = read || noop
  Class.prototype._read = function(size) {
    if (this._reading || this.destroyed) return
    this._reading = true
    this._from(size, this._callback)
  }

  Class.prototype.destroy = function(err) {
    if (this.destroyed) return
    this.destroyed = true

    var self = this
    process.nextTick(function() {
      if (err) self.emit('error', err)
      self.emit('close')
    })
  }

  return Class
}

function obj(opts, read) {
  if (typeof opts === 'function' || Array.isArray(opts)) {
    read = opts
    opts = {}
  }

  opts = defaults(opts)
  opts.objectMode = true
  opts.highWaterMark = 16

  return from2(opts, read)
}

function noop () {}

function defaults(opts) {
  opts = opts || {}
  return opts
}

}).call(this,require('_process'))
},{"_process":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/process/browser.js","inherits":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/inherits/inherits_browser.js","readable-stream":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/readable-stream/readable-browser.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hypercore-crypto/index.js":[function(require,module,exports){
var sodium = require('sodium-universal')
var uint64be = require('uint64be')
var bufferFrom = require('buffer-from')
var bufferAlloc = require('buffer-alloc-unsafe')

// https://en.wikipedia.org/wiki/Merkle_tree#Second_preimage_attack
var LEAF_TYPE = bufferFrom([0])
var PARENT_TYPE = bufferFrom([1])
var ROOT_TYPE = bufferFrom([2])
var HYPERCORE = bufferFrom('hypercore')

exports.keyPair = function (seed) {
  var publicKey = bufferAlloc(sodium.crypto_sign_PUBLICKEYBYTES)
  var secretKey = bufferAlloc(sodium.crypto_sign_SECRETKEYBYTES)

  if (seed) sodium.crypto_sign_seed_keypair(publicKey, secretKey, seed)
  else sodium.crypto_sign_keypair(publicKey, secretKey)

  return {
    publicKey: publicKey,
    secretKey: secretKey
  }
}

exports.sign = function (message, secretKey) {
  var signature = bufferAlloc(sodium.crypto_sign_BYTES)
  sodium.crypto_sign_detached(signature, message, secretKey)
  return signature
}

exports.verify = function (message, signature, publicKey) {
  return sodium.crypto_sign_verify_detached(signature, message, publicKey)
}

exports.data = function (data) {
  return blake2b([
    LEAF_TYPE,
    encodeUInt64(data.length),
    data
  ])
}

exports.leaf = function (leaf) {
  return exports.data(leaf.data)
}

exports.parent = function (a, b) {
  if (a.index > b.index) {
    var tmp = a
    a = b
    b = tmp
  }

  return blake2b([
    PARENT_TYPE,
    encodeUInt64(a.size + b.size),
    a.hash,
    b.hash
  ])
}

exports.tree = function (roots) {
  var buffers = new Array(3 * roots.length + 1)
  var j = 0

  buffers[j++] = ROOT_TYPE

  for (var i = 0; i < roots.length; i++) {
    var r = roots[i]
    buffers[j++] = r.hash
    buffers[j++] = encodeUInt64(r.index)
    buffers[j++] = encodeUInt64(r.size)
  }

  return blake2b(buffers)
}

exports.randomBytes = function (n) {
  var buf = bufferAlloc(n)
  sodium.randombytes_buf(buf)
  return buf
}

exports.discoveryKey = function (tree) {
  var digest = bufferAlloc(32)
  sodium.crypto_generichash(digest, HYPERCORE, tree)
  return digest
}

function encodeUInt64 (n) {
  return uint64be.encode(n, bufferAlloc(8))
}

function blake2b (buffers) {
  var digest = bufferAlloc(32)
  sodium.crypto_generichash_batch(digest, buffers)
  return digest
}

},{"buffer-alloc-unsafe":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/buffer-alloc-unsafe/index.js","buffer-from":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/buffer-from/index.js","sodium-universal":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/sodium-universal/browser.js","uint64be":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/uint64be/index.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hypercore-protocol/feed.js":[function(require,module,exports){
(function (process){
var events = require('events')
var inherits = require('inherits')
var varint = require('varint')
var messages = require('./messages')
var bufferAlloc = require('buffer-alloc-unsafe')

module.exports = Feed

function Feed (stream) {
  if (!(this instanceof Feed)) return new Feed(stream)
  events.EventEmitter.call(this)

  this.key = null
  this.discoveryKey = null
  this.stream = stream
  this.peer = null // support a peer object to avoid event emitter + closures overhead

  this.id = -1
  this.remoteId = -1
  this.header = 0
  this.headerLength = 0
  this.closed = false

  this._buffer = []
}

inherits(Feed, events.EventEmitter)

Feed.prototype.handshake = function (message) {
  return this._send(1, messages.Handshake, message)
}

Feed.prototype.info = function (message) {
  return this._send(2, messages.Info, message)
}

Feed.prototype.have = function (message) {
  return this._send(3, messages.Have, message)
}

Feed.prototype.unhave = function (message) {
  return this._send(4, messages.Unhave, message)
}

Feed.prototype.want = function (message) {
  return this._send(5, messages.Want, message)
}

Feed.prototype.unwant = function (message) {
  return this._send(6, messages.Unwant, message)
}

Feed.prototype.request = function (message) {
  return this._send(7, messages.Request, message)
}

Feed.prototype.cancel = function (message) {
  return this._send(8, messages.Cancel, message)
}

Feed.prototype.data = function (message) {
  return this._send(9, messages.Data, message)
}

Feed.prototype.extension = function (type, message) {
  var id = this.stream.extensions.indexOf(type)
  if (id === -1) return false

  var header = this.header | 15
  var len = this.headerLength + varint.encodingLength(id) + message.length
  var box = bufferAlloc(varint.encodingLength(len) + len)
  var offset = 0

  varint.encode(len, box, offset)
  offset += varint.encode.bytes

  varint.encode(header, box, offset)
  offset += varint.encode.bytes

  varint.encode(id, box, offset)
  offset += varint.encode.bytes

  message.copy(box, offset)
  return this.stream._push(box)
}

Feed.prototype.remoteSupports = function (name) {
  return this.stream.remoteSupports(name)
}

Feed.prototype.destroy = function (err) {
  this.stream.destroy(err)
}

Feed.prototype.close = function () {
  var i = this.stream.feeds.indexOf(this)

  if (i > -1) {
    this.stream.feeds[i] = this.stream.feeds[this.stream.feeds.length - 1]
    this.stream.feeds.pop()
    this.stream._localFeeds[this.id] = null
    this.id = -1

    if (this.stream.destroyed) return
    if (this.stream.expectedFeeds <= 0 || --this.stream.expectedFeeds) return

    this.stream._prefinalize()
  }
}

Feed.prototype._onclose = function () {
  if (this.closed) return
  this.closed = true

  if (!this.stream.destroyed) {
    this.close()
    if (this.remoteId > -1) this.stream._remoteFeeds[this.remoteId] = null
    var hex = this.discoveryKey.toString('hex')
    if (this.stream._feeds[hex] === this) delete this.stream._feeds[hex]
  }

  if (this.peer) this.peer.onclose()
  else this.emit('close')
}

Feed.prototype._resume = function () {
  var self = this
  process.nextTick(resume)

  function resume () {
    while (self._buffer.length) {
      var next = self._buffer.shift()
      self._emit(next.type, next.message)
    }
    self._buffer = null
  }
}

Feed.prototype._onextension = function (data, start, end) {
  if (end <= start) return

  var id = varint.decode(data, start)
  var r = this.stream.remoteExtensions
  var localId = !r || id >= r.length ? -1 : r[id]

  if (localId === -1) return

  var message = data.slice(start + varint.decode.bytes, end)
  var name = this.stream.extensions[localId]

  if (this.peer && this.peer.onextension) this.peer.onextension(name, message)
  else this.emit('extension', name, message)
}

Feed.prototype._onmessage = function (type, data, start, end) {
  var message = decodeMessage(type, data, start, end)
  if (!message || this.closed) return

  if (type === 1) return this.stream._onhandshake(message)

  if (!this._buffer) {
    this._emit(type, message)
    return
  }

  if (this._buffer.length > 16) {
    this.destroy(new Error('Remote sent too many messages on an unopened feed'))
    return
  }

  this._buffer.push({type: type, message: message})
}

Feed.prototype._emit = function (type, message) {
  if (this.peer) {
    switch (type) {
      case 2: return this.peer.oninfo(message)
      case 3: return this.peer.onhave(message)
      case 4: return this.peer.onunhave(message)
      case 5: return this.peer.onwant(message)
      case 6: return this.peer.onunwant(message)
      case 7: return this.peer.onrequest(message)
      case 8: return this.peer.oncancel(message)
      case 9: return this.peer.ondata(message)
    }
  } else {
    switch (type) {
      case 2: return this.emit('info', message)
      case 3: return this.emit('have', message)
      case 4: return this.emit('unhave', message)
      case 5: return this.emit('want', message)
      case 6: return this.emit('unwant', message)
      case 7: return this.emit('request', message)
      case 8: return this.emit('cancel', message)
      case 9: return this.emit('data', message)
    }
  }
}

Feed.prototype._send = function (type, enc, message) {
  var header = this.header | type
  var len = this.headerLength + enc.encodingLength(message)
  var box = bufferAlloc(varint.encodingLength(len) + len)
  var offset = 0

  varint.encode(len, box, offset)
  offset += varint.encode.bytes

  varint.encode(header, box, offset)
  offset += varint.encode.bytes

  enc.encode(message, box, offset)

  return this.stream._push(box)
}

function decodeMessage (type, data, start, end) {
  switch (type) {
    case 1: return decode(messages.Handshake, data, start, end)
    case 2: return decode(messages.Info, data, start, end)
    case 3: return decode(messages.Have, data, start, end)
    case 4: return decode(messages.Unhave, data, start, end)
    case 5: return decode(messages.Want, data, start, end)
    case 6: return decode(messages.Unwant, data, start, end)
    case 7: return decode(messages.Request, data, start, end)
    case 8: return decode(messages.Cancel, data, start, end)
    case 9: return decode(messages.Data, data, start, end)
  }
}

function decode (enc, data, start, end) {
  try {
    return enc.decode(data, start, end)
  } catch (err) {
    return null
  }
}

}).call(this,require('_process'))
},{"./messages":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hypercore-protocol/messages.js","_process":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/process/browser.js","buffer-alloc-unsafe":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/buffer-alloc-unsafe/index.js","events":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/browserify/node_modules/events/events.js","inherits":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/inherits/inherits_browser.js","varint":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hypercore-protocol/node_modules/varint/index.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hypercore-protocol/index.js":[function(require,module,exports){
(function (process){
var stream = require('readable-stream')
var inherits = require('inherits')
var varint = require('varint')
var sodium = require('sodium-universal')
var indexOf = require('sorted-indexof')
var feed = require('./feed')
var messages = require('./messages')
var bufferAlloc = require('buffer-alloc-unsafe')
var bufferFrom = require('buffer-from')

module.exports = Protocol

function Protocol (opts) {
  if (!(this instanceof Protocol)) return new Protocol(opts)
  if (!opts) opts = {}

  stream.Duplex.call(this)
  var self = this

  this.id = opts.id || randomBytes(32)
  this.live = !!opts.live
  this.ack = !!opts.ack
  this.userData = opts.userData || null
  this.remoteId = null
  this.remoteLive = false
  this.remoteUserData = null

  this.destroyed = false
  this.encrypted = opts.encrypt !== false
  this.key = null
  this.discoveryKey = null
  this.remoteDiscoveryKey = null
  this.feeds = []
  this.expectedFeeds = opts.expectedFeeds || 0
  this.extensions = opts.extensions || []
  this.remoteExtensions = null
  this.maxFeeds = opts.maxFeeds || 256

  this._localFeeds = []
  this._remoteFeeds = []
  this._feeds = {}

  this._nonce = null
  this._remoteNonce = null
  this._xor = null
  this._remoteXor = null
  this._needsKey = false
  this._length = bufferAlloc(varint.encodingLength(8388608))
  this._missing = 0
  this._buf = null
  this._pointer = 0
  this._data = null
  this._start = 0
  this._cb = null
  this._interval = null
  this._keepAlive = 0
  this._remoteKeepAlive = 0
  this._maybeFinalize = maybeFinalize
  this._utp = null

  if (opts.timeout !== 0 && opts.timeout !== false) this.setTimeout(opts.timeout || 5000, this._ontimeout)
  this.on('finish', this.finalize)
  this.on('pipe', this._onpipe)

  function maybeFinalize (err) {
    if (err) return self.destroy(err)
    if (!self.expectedFeeds) self.finalize()
  }
}

inherits(Protocol, stream.Duplex)

Protocol.prototype._onpipe = function (stream) {
  if (typeof stream.setContentSize === 'function') this._utp = stream
}

Protocol.prototype._prefinalize = function () {
  if (!this.emit('prefinalize', this._maybeFinalize)) this.finalize()
}

Protocol.prototype.setTimeout = function (ms, ontimeout) {
  if (this.destroyed) return
  if (ontimeout) this.once('timeout', ontimeout)

  var self = this

  this._keepAlive = 0
  this._remoteKeepAlive = 0

  clearInterval(this._interval)
  if (!ms) return

  this._interval = setInterval(kick, (ms / 4) | 0)
  if (this._interval.unref) this._interval.unref()

  function kick () {
    self._kick()
  }
}

Protocol.prototype.has = function (key) {
  var hex = discoveryKey(key).toString('hex')
  var ch = this._feeds[hex]
  return !!ch
}

Protocol.prototype.feed = function (key, opts) {
  if (this.destroyed) return null
  if (!opts) opts = {}

  var dk = opts.discoveryKey || discoveryKey(key)
  var ch = this._feed(dk)

  if (ch.id > -1) {
    if (opts.peer) ch.peer = opts.peer
    return ch
  }

  if (this._localFeeds.length >= this.maxFeeds) {
    this._tooManyFeeds()
    return null
  }

  ch.id = this._localFeeds.push(ch) - 1
  ch.header = ch.id << 4
  ch.headerLength = varint.encodingLength(ch.header)
  ch.key = key
  ch.discoveryKey = dk
  if (opts.peer) ch.peer = opts.peer

  this.feeds.push(ch)

  var first = !this.key
  var feed = {
    discoveryKey: dk,
    nonce: null
  }

  if (first) {
    this.key = key
    this.discoveryKey = dk

    if (!this._sameKey()) return null

    if (this.encrypted) {
      feed.nonce = this._nonce = randomBytes(24)
      this._xor = sodium.crypto_stream_xor_instance(this._nonce, this.key)
      if (this._remoteNonce) {
        this._remoteXor = sodium.crypto_stream_xor_instance(this._remoteNonce, this.key)
      }
    }

    if (this._needsKey) {
      this._needsKey = false
      this._resume()
    }
  }

  var box = encodeFeed(feed, ch.id)
  if (!feed.nonce && this.encrypted) this._xor.update(box, box)
  this._keepAlive = 0
  this.push(box)

  if (this.destroyed) return null

  if (first) {
    ch.handshake({
      id: this.id,
      live: this.live,
      userData: this.userData,
      extensions: this.extensions,
      ack: this.ack
    })
  }

  if (ch._buffer.length) ch._resume()
  else ch._buffer = null

  return ch
}

Protocol.prototype._resume = function () {
  var self = this
  process.nextTick(resume)

  function resume () {
    if (!self._data) return

    var data = self._data
    var start = self._start
    var cb = self._cb

    self._data = null
    self._start = 0
    self._cb = null
    self._parse(data, start, cb)
  }
}

Protocol.prototype._kick = function () {
  if (this._remoteKeepAlive > 4) {
    clearInterval(this._interval)
    this.emit('timeout')
    return
  }

  for (var i = 0; i < this.feeds.length; i++) {
    var ch = this.feeds[i]
    if (ch.peer) ch.peer.ontick()
    else ch.emit('tick')
  }

  this._remoteKeepAlive++

  if (this._keepAlive > 2) {
    this.ping()
    this._keepAlive = 0
  } else {
    this._keepAlive++
  }
}

Protocol.prototype.ping = function () {
  if (!this.key) return true
  var ping = bufferFrom([0])
  if (this._xor) this._xor.update(ping, ping)
  return this.push(ping)
}

Protocol.prototype.destroy = function (err) {
  if (this.destroyed) return
  this.destroyed = true
  if (err) this.emit('error', err)
  this._close()
  this.emit('close')
}

Protocol.prototype.finalize = function () {
  if (this.destroyed) return
  this.destroyed = true
  this._close()
  this.push(null)
}

Protocol.prototype._close = function () {
  clearInterval(this._interval)

  var feeds = this.feeds
  this.feeds = []
  for (var i = 0; i < feeds.length; i++) feeds[i]._onclose()

  if (this._xor) {
    this._xor.final()
    this._xor = null
  }
}

Protocol.prototype._read = function () {
  // do nothing, user back-pressures
}

Protocol.prototype._push = function (data) {
  if (this.destroyed) return
  this._keepAlive = 0
  if (this._xor) this._xor.update(data, data)
  return this.push(data)
}

Protocol.prototype._write = function (data, enc, cb) {
  this._remoteKeepAlive = 0
  this._parse(data, 0, cb)
}

Protocol.prototype._feed = function (dk) {
  var hex = dk.toString('hex')
  var ch = this._feeds[hex]
  if (ch) return ch
  ch = this._feeds[hex] = feed(this)
  return ch
}

Protocol.prototype.remoteSupports = function (name) {
  var i = this.extensions.indexOf(name)
  return i > -1 && !!this.remoteExtensions && this.remoteExtensions.indexOf(i) > -1
}

Protocol.prototype._onhandshake = function (handshake) {
  if (this.remoteId) return

  this.remoteId = handshake.id || randomBytes(32)
  this.remoteLive = handshake.live
  this.remoteUserData = handshake.userData
  this.remoteExtensions = indexOf(this.extensions, handshake.extensions)
  this.remoteAck = handshake.ack

  this.emit('handshake')
}

Protocol.prototype._onopen = function (id, data, start, end) {
  var feed = decodeFeed(data, start, end)

  if (!feed) return this._badFeed()

  if (!this.remoteDiscoveryKey) {
    this.remoteDiscoveryKey = feed.discoveryKey
    if (!this._sameKey()) return

    if (this.encrypted && !this._remoteNonce) {
      if (!feed.nonce) {
        this.destroy(new Error('Remote did not include a nonce'))
        return
      }
      this._remoteNonce = feed.nonce
    }

    if (this.encrypted && this.key && !this._remoteXor) {
      this._remoteXor = sodium.crypto_stream_xor_instance(this._remoteNonce, this.key)
    }
  }

  this._remoteFeeds[id] = this._feed(feed.discoveryKey)
  this._remoteFeeds[id].remoteId = id

  this.emit('feed', feed.discoveryKey)
}

Protocol.prototype._onmessage = function (data, start, end) {
  if (end - start < 2) return

  var header = decodeHeader(data, start)
  if (header === -1) return this.destroy(new Error('Remote sent invalid header'))

  start += varint.decode.bytes

  var id = header >> 4
  var type = header & 15

  if (id >= this.maxFeeds) return this._tooManyFeeds()
  while (this._remoteFeeds.length < id) this._remoteFeeds.push(null)

  var ch = this._remoteFeeds[id]

  if (type === 0) {
    if (ch) ch._onclose()
    return this._onopen(id, data, start, end)
  }

  if (!ch) return this._badFeed()
  if (type === 15) return ch._onextension(data, start, end)
  ch._onmessage(type, data, start, end)
}

Protocol.prototype._parse = function (data, start, cb) {
  var decrypted = !!this._remoteXor

  if (start) {
    data = data.slice(start)
    start = 0
  }

  if (this._remoteXor) this._remoteXor.update(data, data)

  while (start < data.length && !this.destroyed) {
    if (this._missing) start = this._parseMessage(data, start)
    else start = this._parseLength(data, start)

    if (this._needsKey) {
      this._data = data
      this._start = start
      this._cb = cb
      return
    }

    if (!decrypted && this._remoteXor) {
      return this._parse(data, start, cb)
    }
  }

  cb()
}

Protocol.prototype._parseMessage = function (data, start) {
  var end = start + this._missing

  if (end <= data.length) {
    var ret = end

    if (this._buf) {
      data.copy(this._buf, this._pointer, start)
      data = this._buf
      start = 0
      end = data.length
      this._buf = null
    }

    this._missing = 0
    this._pointer = 0
    if (this.encrypted && !this.key) this._needsKey = true
    this._onmessage(data, start, end)

    return ret
  }

  if (!this._buf) {
    this._buf = bufferAlloc(this._missing)
    this._pointer = 0
  }

  var rem = data.length - start

  data.copy(this._buf, this._pointer, start)
  this._pointer += rem
  this._missing -= rem

  return data.length
}

Protocol.prototype._parseLength = function (data, start) {
  while (!this._missing && start < data.length) {
    var byte = this._length[this._pointer++] = data[start++]

    if (!(byte & 0x80)) {
      this._missing = varint.decode(this._length)
      this._pointer = 0
      if (this._missing > 8388608) return this._tooBig(data.length)
      if (this._utp) {
        var reallyMissing = this._missing - (data.length - start)
        if (reallyMissing > 0 && !this._needsKey) this._utp.setContentSize(reallyMissing)
      }
      return start
    }

    if (this._pointer >= this._length.length) return this._tooBig(data.length)
  }

  return start
}

Protocol.prototype._sameKey = function () {
  if (!this.encrypted) return true
  if (!this.discoveryKey || !this.remoteDiscoveryKey) return true
  if (this.remoteDiscoveryKey.toString('hex') === this.discoveryKey.toString('hex')) return true
  this.destroy(new Error('First shared hypercore must be the same'))
  return false
}

Protocol.prototype._tooManyFeeds = function () {
  this.destroy(new Error('Only ' + this.maxFeeds + ' feeds currently supported. Open a Github issue if you need more'))
}

Protocol.prototype._tooBig = function (len) {
  this.destroy(new Error('Remote message is larger than 8MB (max allowed)'))
  return len
}

Protocol.prototype._badFeed = function () {
  this.destroy(new Error('Remote sent invalid feed message'))
}

Protocol.prototype._ontimeout = function () {
  this.destroy(new Error('Remote timed out'))
}

function decodeHeader (data, start) {
  try {
    return varint.decode(data, start)
  } catch (err) {
    return -1
  }
}

function decodeFeed (data, start, end) {
  var feed = null

  try {
    feed = messages.Feed.decode(data, start, end)
  } catch (err) {
    return null
  }

  if (feed.discoveryKey.length !== 32) return null
  if (feed.nonce && feed.nonce.length !== 24) return null

  return feed
}

function encodeFeed (feed, id) {
  var header = id << 4
  var len = varint.encodingLength(header) + messages.Feed.encodingLength(feed)
  var box = bufferAlloc(varint.encodingLength(len) + len)
  var offset = 0

  varint.encode(len, box, offset)
  offset += varint.encode.bytes

  varint.encode(header, box, offset)
  offset += varint.encode.bytes

  messages.Feed.encode(feed, box, offset)
  return box
}

function discoveryKey (key) {
  var buf = bufferAlloc(32)
  sodium.crypto_generichash(buf, bufferFrom('hypercore'), key)
  return buf
}

function randomBytes (n) {
  var buf = bufferAlloc(n)
  sodium.randombytes_buf(buf)
  return buf
}

}).call(this,require('_process'))
},{"./feed":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hypercore-protocol/feed.js","./messages":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hypercore-protocol/messages.js","_process":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/process/browser.js","buffer-alloc-unsafe":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/buffer-alloc-unsafe/index.js","buffer-from":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/buffer-from/index.js","inherits":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/inherits/inherits_browser.js","readable-stream":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/readable-stream/readable-browser.js","sodium-universal":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/sodium-universal/browser.js","sorted-indexof":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/sorted-indexof/index.js","varint":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hypercore-protocol/node_modules/varint/index.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hypercore-protocol/messages.js":[function(require,module,exports){
(function (Buffer){
// This file is auto generated by the protocol-buffers compiler

/* eslint-disable quotes */
/* eslint-disable indent */
/* eslint-disable no-redeclare */
/* eslint-disable camelcase */

// Remember to `npm install --save protocol-buffers-encodings`
var encodings = require('protocol-buffers-encodings')
var varint = encodings.varint
var skip = encodings.skip

var Feed = exports.Feed = {
  buffer: true,
  encodingLength: null,
  encode: null,
  decode: null
}

var Handshake = exports.Handshake = {
  buffer: true,
  encodingLength: null,
  encode: null,
  decode: null
}

var Info = exports.Info = {
  buffer: true,
  encodingLength: null,
  encode: null,
  decode: null
}

var Have = exports.Have = {
  buffer: true,
  encodingLength: null,
  encode: null,
  decode: null
}

var Unhave = exports.Unhave = {
  buffer: true,
  encodingLength: null,
  encode: null,
  decode: null
}

var Want = exports.Want = {
  buffer: true,
  encodingLength: null,
  encode: null,
  decode: null
}

var Unwant = exports.Unwant = {
  buffer: true,
  encodingLength: null,
  encode: null,
  decode: null
}

var Request = exports.Request = {
  buffer: true,
  encodingLength: null,
  encode: null,
  decode: null
}

var Cancel = exports.Cancel = {
  buffer: true,
  encodingLength: null,
  encode: null,
  decode: null
}

var Data = exports.Data = {
  buffer: true,
  encodingLength: null,
  encode: null,
  decode: null
}

defineFeed()
defineHandshake()
defineInfo()
defineHave()
defineUnhave()
defineWant()
defineUnwant()
defineRequest()
defineCancel()
defineData()

function defineFeed () {
  var enc = [
    encodings.bytes
  ]

  Feed.encodingLength = encodingLength
  Feed.encode = encode
  Feed.decode = decode

  function encodingLength (obj) {
    var length = 0
    if (!defined(obj.discoveryKey)) throw new Error("discoveryKey is required")
    var len = enc[0].encodingLength(obj.discoveryKey)
    length += 1 + len
    if (defined(obj.nonce)) {
      var len = enc[0].encodingLength(obj.nonce)
      length += 1 + len
    }
    return length
  }

  function encode (obj, buf, offset) {
    if (!offset) offset = 0
    if (!buf) buf = Buffer.allocUnsafe(encodingLength(obj))
    var oldOffset = offset
    if (!defined(obj.discoveryKey)) throw new Error("discoveryKey is required")
    buf[offset++] = 10
    enc[0].encode(obj.discoveryKey, buf, offset)
    offset += enc[0].encode.bytes
    if (defined(obj.nonce)) {
      buf[offset++] = 18
      enc[0].encode(obj.nonce, buf, offset)
      offset += enc[0].encode.bytes
    }
    encode.bytes = offset - oldOffset
    return buf
  }

  function decode (buf, offset, end) {
    if (!offset) offset = 0
    if (!end) end = buf.length
    if (!(end <= buf.length && offset <= buf.length)) throw new Error("Decoded message is not valid")
    var oldOffset = offset
    var obj = {
      discoveryKey: null,
      nonce: null
    }
    var found0 = false
    while (true) {
      if (end <= offset) {
        if (!found0) throw new Error("Decoded message is not valid")
        decode.bytes = offset - oldOffset
        return obj
      }
      var prefix = varint.decode(buf, offset)
      offset += varint.decode.bytes
      var tag = prefix >> 3
      switch (tag) {
        case 1:
        obj.discoveryKey = enc[0].decode(buf, offset)
        offset += enc[0].decode.bytes
        found0 = true
        break
        case 2:
        obj.nonce = enc[0].decode(buf, offset)
        offset += enc[0].decode.bytes
        break
        default:
        offset = skip(prefix & 7, buf, offset)
      }
    }
  }
}

function defineHandshake () {
  var enc = [
    encodings.bytes,
    encodings.bool,
    encodings.string
  ]

  Handshake.encodingLength = encodingLength
  Handshake.encode = encode
  Handshake.decode = decode

  function encodingLength (obj) {
    var length = 0
    if (defined(obj.id)) {
      var len = enc[0].encodingLength(obj.id)
      length += 1 + len
    }
    if (defined(obj.live)) {
      var len = enc[1].encodingLength(obj.live)
      length += 1 + len
    }
    if (defined(obj.userData)) {
      var len = enc[0].encodingLength(obj.userData)
      length += 1 + len
    }
    if (defined(obj.extensions)) {
      for (var i = 0; i < obj.extensions.length; i++) {
        if (!defined(obj.extensions[i])) continue
        var len = enc[2].encodingLength(obj.extensions[i])
        length += 1 + len
      }
    }
    if (defined(obj.ack)) {
      var len = enc[1].encodingLength(obj.ack)
      length += 1 + len
    }
    return length
  }

  function encode (obj, buf, offset) {
    if (!offset) offset = 0
    if (!buf) buf = Buffer.allocUnsafe(encodingLength(obj))
    var oldOffset = offset
    if (defined(obj.id)) {
      buf[offset++] = 10
      enc[0].encode(obj.id, buf, offset)
      offset += enc[0].encode.bytes
    }
    if (defined(obj.live)) {
      buf[offset++] = 16
      enc[1].encode(obj.live, buf, offset)
      offset += enc[1].encode.bytes
    }
    if (defined(obj.userData)) {
      buf[offset++] = 26
      enc[0].encode(obj.userData, buf, offset)
      offset += enc[0].encode.bytes
    }
    if (defined(obj.extensions)) {
      for (var i = 0; i < obj.extensions.length; i++) {
        if (!defined(obj.extensions[i])) continue
        buf[offset++] = 34
        enc[2].encode(obj.extensions[i], buf, offset)
        offset += enc[2].encode.bytes
      }
    }
    if (defined(obj.ack)) {
      buf[offset++] = 40
      enc[1].encode(obj.ack, buf, offset)
      offset += enc[1].encode.bytes
    }
    encode.bytes = offset - oldOffset
    return buf
  }

  function decode (buf, offset, end) {
    if (!offset) offset = 0
    if (!end) end = buf.length
    if (!(end <= buf.length && offset <= buf.length)) throw new Error("Decoded message is not valid")
    var oldOffset = offset
    var obj = {
      id: null,
      live: false,
      userData: null,
      extensions: [],
      ack: false
    }
    while (true) {
      if (end <= offset) {
        decode.bytes = offset - oldOffset
        return obj
      }
      var prefix = varint.decode(buf, offset)
      offset += varint.decode.bytes
      var tag = prefix >> 3
      switch (tag) {
        case 1:
        obj.id = enc[0].decode(buf, offset)
        offset += enc[0].decode.bytes
        break
        case 2:
        obj.live = enc[1].decode(buf, offset)
        offset += enc[1].decode.bytes
        break
        case 3:
        obj.userData = enc[0].decode(buf, offset)
        offset += enc[0].decode.bytes
        break
        case 4:
        obj.extensions.push(enc[2].decode(buf, offset))
        offset += enc[2].decode.bytes
        break
        case 5:
        obj.ack = enc[1].decode(buf, offset)
        offset += enc[1].decode.bytes
        break
        default:
        offset = skip(prefix & 7, buf, offset)
      }
    }
  }
}

function defineInfo () {
  var enc = [
    encodings.bool
  ]

  Info.encodingLength = encodingLength
  Info.encode = encode
  Info.decode = decode

  function encodingLength (obj) {
    var length = 0
    if (defined(obj.uploading)) {
      var len = enc[0].encodingLength(obj.uploading)
      length += 1 + len
    }
    if (defined(obj.downloading)) {
      var len = enc[0].encodingLength(obj.downloading)
      length += 1 + len
    }
    return length
  }

  function encode (obj, buf, offset) {
    if (!offset) offset = 0
    if (!buf) buf = Buffer.allocUnsafe(encodingLength(obj))
    var oldOffset = offset
    if (defined(obj.uploading)) {
      buf[offset++] = 8
      enc[0].encode(obj.uploading, buf, offset)
      offset += enc[0].encode.bytes
    }
    if (defined(obj.downloading)) {
      buf[offset++] = 16
      enc[0].encode(obj.downloading, buf, offset)
      offset += enc[0].encode.bytes
    }
    encode.bytes = offset - oldOffset
    return buf
  }

  function decode (buf, offset, end) {
    if (!offset) offset = 0
    if (!end) end = buf.length
    if (!(end <= buf.length && offset <= buf.length)) throw new Error("Decoded message is not valid")
    var oldOffset = offset
    var obj = {
      uploading: false,
      downloading: false
    }
    while (true) {
      if (end <= offset) {
        decode.bytes = offset - oldOffset
        return obj
      }
      var prefix = varint.decode(buf, offset)
      offset += varint.decode.bytes
      var tag = prefix >> 3
      switch (tag) {
        case 1:
        obj.uploading = enc[0].decode(buf, offset)
        offset += enc[0].decode.bytes
        break
        case 2:
        obj.downloading = enc[0].decode(buf, offset)
        offset += enc[0].decode.bytes
        break
        default:
        offset = skip(prefix & 7, buf, offset)
      }
    }
  }
}

function defineHave () {
  var enc = [
    encodings.varint,
    encodings.bytes,
    encodings.bool
  ]

  Have.encodingLength = encodingLength
  Have.encode = encode
  Have.decode = decode

  function encodingLength (obj) {
    var length = 0
    if (!defined(obj.start)) throw new Error("start is required")
    var len = enc[0].encodingLength(obj.start)
    length += 1 + len
    if (defined(obj.length)) {
      var len = enc[0].encodingLength(obj.length)
      length += 1 + len
    }
    if (defined(obj.bitfield)) {
      var len = enc[1].encodingLength(obj.bitfield)
      length += 1 + len
    }
    if (defined(obj.ack)) {
      var len = enc[2].encodingLength(obj.ack)
      length += 1 + len
    }
    return length
  }

  function encode (obj, buf, offset) {
    if (!offset) offset = 0
    if (!buf) buf = Buffer.allocUnsafe(encodingLength(obj))
    var oldOffset = offset
    if (!defined(obj.start)) throw new Error("start is required")
    buf[offset++] = 8
    enc[0].encode(obj.start, buf, offset)
    offset += enc[0].encode.bytes
    if (defined(obj.length)) {
      buf[offset++] = 16
      enc[0].encode(obj.length, buf, offset)
      offset += enc[0].encode.bytes
    }
    if (defined(obj.bitfield)) {
      buf[offset++] = 26
      enc[1].encode(obj.bitfield, buf, offset)
      offset += enc[1].encode.bytes
    }
    if (defined(obj.ack)) {
      buf[offset++] = 32
      enc[2].encode(obj.ack, buf, offset)
      offset += enc[2].encode.bytes
    }
    encode.bytes = offset - oldOffset
    return buf
  }

  function decode (buf, offset, end) {
    if (!offset) offset = 0
    if (!end) end = buf.length
    if (!(end <= buf.length && offset <= buf.length)) throw new Error("Decoded message is not valid")
    var oldOffset = offset
    var obj = {
      start: 0,
      length: 1,
      bitfield: null,
      ack: false
    }
    var found0 = false
    while (true) {
      if (end <= offset) {
        if (!found0) throw new Error("Decoded message is not valid")
        decode.bytes = offset - oldOffset
        return obj
      }
      var prefix = varint.decode(buf, offset)
      offset += varint.decode.bytes
      var tag = prefix >> 3
      switch (tag) {
        case 1:
        obj.start = enc[0].decode(buf, offset)
        offset += enc[0].decode.bytes
        found0 = true
        break
        case 2:
        obj.length = enc[0].decode(buf, offset)
        offset += enc[0].decode.bytes
        break
        case 3:
        obj.bitfield = enc[1].decode(buf, offset)
        offset += enc[1].decode.bytes
        break
        case 4:
        obj.ack = enc[2].decode(buf, offset)
        offset += enc[2].decode.bytes
        break
        default:
        offset = skip(prefix & 7, buf, offset)
      }
    }
  }
}

function defineUnhave () {
  var enc = [
    encodings.varint
  ]

  Unhave.encodingLength = encodingLength
  Unhave.encode = encode
  Unhave.decode = decode

  function encodingLength (obj) {
    var length = 0
    if (!defined(obj.start)) throw new Error("start is required")
    var len = enc[0].encodingLength(obj.start)
    length += 1 + len
    if (defined(obj.length)) {
      var len = enc[0].encodingLength(obj.length)
      length += 1 + len
    }
    return length
  }

  function encode (obj, buf, offset) {
    if (!offset) offset = 0
    if (!buf) buf = Buffer.allocUnsafe(encodingLength(obj))
    var oldOffset = offset
    if (!defined(obj.start)) throw new Error("start is required")
    buf[offset++] = 8
    enc[0].encode(obj.start, buf, offset)
    offset += enc[0].encode.bytes
    if (defined(obj.length)) {
      buf[offset++] = 16
      enc[0].encode(obj.length, buf, offset)
      offset += enc[0].encode.bytes
    }
    encode.bytes = offset - oldOffset
    return buf
  }

  function decode (buf, offset, end) {
    if (!offset) offset = 0
    if (!end) end = buf.length
    if (!(end <= buf.length && offset <= buf.length)) throw new Error("Decoded message is not valid")
    var oldOffset = offset
    var obj = {
      start: 0,
      length: 1
    }
    var found0 = false
    while (true) {
      if (end <= offset) {
        if (!found0) throw new Error("Decoded message is not valid")
        decode.bytes = offset - oldOffset
        return obj
      }
      var prefix = varint.decode(buf, offset)
      offset += varint.decode.bytes
      var tag = prefix >> 3
      switch (tag) {
        case 1:
        obj.start = enc[0].decode(buf, offset)
        offset += enc[0].decode.bytes
        found0 = true
        break
        case 2:
        obj.length = enc[0].decode(buf, offset)
        offset += enc[0].decode.bytes
        break
        default:
        offset = skip(prefix & 7, buf, offset)
      }
    }
  }
}

function defineWant () {
  var enc = [
    encodings.varint
  ]

  Want.encodingLength = encodingLength
  Want.encode = encode
  Want.decode = decode

  function encodingLength (obj) {
    var length = 0
    if (!defined(obj.start)) throw new Error("start is required")
    var len = enc[0].encodingLength(obj.start)
    length += 1 + len
    if (defined(obj.length)) {
      var len = enc[0].encodingLength(obj.length)
      length += 1 + len
    }
    return length
  }

  function encode (obj, buf, offset) {
    if (!offset) offset = 0
    if (!buf) buf = Buffer.allocUnsafe(encodingLength(obj))
    var oldOffset = offset
    if (!defined(obj.start)) throw new Error("start is required")
    buf[offset++] = 8
    enc[0].encode(obj.start, buf, offset)
    offset += enc[0].encode.bytes
    if (defined(obj.length)) {
      buf[offset++] = 16
      enc[0].encode(obj.length, buf, offset)
      offset += enc[0].encode.bytes
    }
    encode.bytes = offset - oldOffset
    return buf
  }

  function decode (buf, offset, end) {
    if (!offset) offset = 0
    if (!end) end = buf.length
    if (!(end <= buf.length && offset <= buf.length)) throw new Error("Decoded message is not valid")
    var oldOffset = offset
    var obj = {
      start: 0,
      length: 0
    }
    var found0 = false
    while (true) {
      if (end <= offset) {
        if (!found0) throw new Error("Decoded message is not valid")
        decode.bytes = offset - oldOffset
        return obj
      }
      var prefix = varint.decode(buf, offset)
      offset += varint.decode.bytes
      var tag = prefix >> 3
      switch (tag) {
        case 1:
        obj.start = enc[0].decode(buf, offset)
        offset += enc[0].decode.bytes
        found0 = true
        break
        case 2:
        obj.length = enc[0].decode(buf, offset)
        offset += enc[0].decode.bytes
        break
        default:
        offset = skip(prefix & 7, buf, offset)
      }
    }
  }
}

function defineUnwant () {
  var enc = [
    encodings.varint
  ]

  Unwant.encodingLength = encodingLength
  Unwant.encode = encode
  Unwant.decode = decode

  function encodingLength (obj) {
    var length = 0
    if (!defined(obj.start)) throw new Error("start is required")
    var len = enc[0].encodingLength(obj.start)
    length += 1 + len
    if (defined(obj.length)) {
      var len = enc[0].encodingLength(obj.length)
      length += 1 + len
    }
    return length
  }

  function encode (obj, buf, offset) {
    if (!offset) offset = 0
    if (!buf) buf = Buffer.allocUnsafe(encodingLength(obj))
    var oldOffset = offset
    if (!defined(obj.start)) throw new Error("start is required")
    buf[offset++] = 8
    enc[0].encode(obj.start, buf, offset)
    offset += enc[0].encode.bytes
    if (defined(obj.length)) {
      buf[offset++] = 16
      enc[0].encode(obj.length, buf, offset)
      offset += enc[0].encode.bytes
    }
    encode.bytes = offset - oldOffset
    return buf
  }

  function decode (buf, offset, end) {
    if (!offset) offset = 0
    if (!end) end = buf.length
    if (!(end <= buf.length && offset <= buf.length)) throw new Error("Decoded message is not valid")
    var oldOffset = offset
    var obj = {
      start: 0,
      length: 0
    }
    var found0 = false
    while (true) {
      if (end <= offset) {
        if (!found0) throw new Error("Decoded message is not valid")
        decode.bytes = offset - oldOffset
        return obj
      }
      var prefix = varint.decode(buf, offset)
      offset += varint.decode.bytes
      var tag = prefix >> 3
      switch (tag) {
        case 1:
        obj.start = enc[0].decode(buf, offset)
        offset += enc[0].decode.bytes
        found0 = true
        break
        case 2:
        obj.length = enc[0].decode(buf, offset)
        offset += enc[0].decode.bytes
        break
        default:
        offset = skip(prefix & 7, buf, offset)
      }
    }
  }
}

function defineRequest () {
  var enc = [
    encodings.varint,
    encodings.bool
  ]

  Request.encodingLength = encodingLength
  Request.encode = encode
  Request.decode = decode

  function encodingLength (obj) {
    var length = 0
    if (!defined(obj.index)) throw new Error("index is required")
    var len = enc[0].encodingLength(obj.index)
    length += 1 + len
    if (defined(obj.bytes)) {
      var len = enc[0].encodingLength(obj.bytes)
      length += 1 + len
    }
    if (defined(obj.hash)) {
      var len = enc[1].encodingLength(obj.hash)
      length += 1 + len
    }
    if (defined(obj.nodes)) {
      var len = enc[0].encodingLength(obj.nodes)
      length += 1 + len
    }
    return length
  }

  function encode (obj, buf, offset) {
    if (!offset) offset = 0
    if (!buf) buf = Buffer.allocUnsafe(encodingLength(obj))
    var oldOffset = offset
    if (!defined(obj.index)) throw new Error("index is required")
    buf[offset++] = 8
    enc[0].encode(obj.index, buf, offset)
    offset += enc[0].encode.bytes
    if (defined(obj.bytes)) {
      buf[offset++] = 16
      enc[0].encode(obj.bytes, buf, offset)
      offset += enc[0].encode.bytes
    }
    if (defined(obj.hash)) {
      buf[offset++] = 24
      enc[1].encode(obj.hash, buf, offset)
      offset += enc[1].encode.bytes
    }
    if (defined(obj.nodes)) {
      buf[offset++] = 32
      enc[0].encode(obj.nodes, buf, offset)
      offset += enc[0].encode.bytes
    }
    encode.bytes = offset - oldOffset
    return buf
  }

  function decode (buf, offset, end) {
    if (!offset) offset = 0
    if (!end) end = buf.length
    if (!(end <= buf.length && offset <= buf.length)) throw new Error("Decoded message is not valid")
    var oldOffset = offset
    var obj = {
      index: 0,
      bytes: 0,
      hash: false,
      nodes: 0
    }
    var found0 = false
    while (true) {
      if (end <= offset) {
        if (!found0) throw new Error("Decoded message is not valid")
        decode.bytes = offset - oldOffset
        return obj
      }
      var prefix = varint.decode(buf, offset)
      offset += varint.decode.bytes
      var tag = prefix >> 3
      switch (tag) {
        case 1:
        obj.index = enc[0].decode(buf, offset)
        offset += enc[0].decode.bytes
        found0 = true
        break
        case 2:
        obj.bytes = enc[0].decode(buf, offset)
        offset += enc[0].decode.bytes
        break
        case 3:
        obj.hash = enc[1].decode(buf, offset)
        offset += enc[1].decode.bytes
        break
        case 4:
        obj.nodes = enc[0].decode(buf, offset)
        offset += enc[0].decode.bytes
        break
        default:
        offset = skip(prefix & 7, buf, offset)
      }
    }
  }
}

function defineCancel () {
  var enc = [
    encodings.varint,
    encodings.bool
  ]

  Cancel.encodingLength = encodingLength
  Cancel.encode = encode
  Cancel.decode = decode

  function encodingLength (obj) {
    var length = 0
    if (!defined(obj.index)) throw new Error("index is required")
    var len = enc[0].encodingLength(obj.index)
    length += 1 + len
    if (defined(obj.bytes)) {
      var len = enc[0].encodingLength(obj.bytes)
      length += 1 + len
    }
    if (defined(obj.hash)) {
      var len = enc[1].encodingLength(obj.hash)
      length += 1 + len
    }
    return length
  }

  function encode (obj, buf, offset) {
    if (!offset) offset = 0
    if (!buf) buf = Buffer.allocUnsafe(encodingLength(obj))
    var oldOffset = offset
    if (!defined(obj.index)) throw new Error("index is required")
    buf[offset++] = 8
    enc[0].encode(obj.index, buf, offset)
    offset += enc[0].encode.bytes
    if (defined(obj.bytes)) {
      buf[offset++] = 16
      enc[0].encode(obj.bytes, buf, offset)
      offset += enc[0].encode.bytes
    }
    if (defined(obj.hash)) {
      buf[offset++] = 24
      enc[1].encode(obj.hash, buf, offset)
      offset += enc[1].encode.bytes
    }
    encode.bytes = offset - oldOffset
    return buf
  }

  function decode (buf, offset, end) {
    if (!offset) offset = 0
    if (!end) end = buf.length
    if (!(end <= buf.length && offset <= buf.length)) throw new Error("Decoded message is not valid")
    var oldOffset = offset
    var obj = {
      index: 0,
      bytes: 0,
      hash: false
    }
    var found0 = false
    while (true) {
      if (end <= offset) {
        if (!found0) throw new Error("Decoded message is not valid")
        decode.bytes = offset - oldOffset
        return obj
      }
      var prefix = varint.decode(buf, offset)
      offset += varint.decode.bytes
      var tag = prefix >> 3
      switch (tag) {
        case 1:
        obj.index = enc[0].decode(buf, offset)
        offset += enc[0].decode.bytes
        found0 = true
        break
        case 2:
        obj.bytes = enc[0].decode(buf, offset)
        offset += enc[0].decode.bytes
        break
        case 3:
        obj.hash = enc[1].decode(buf, offset)
        offset += enc[1].decode.bytes
        break
        default:
        offset = skip(prefix & 7, buf, offset)
      }
    }
  }
}

function defineData () {
  var Node = Data.Node = {
    buffer: true,
    encodingLength: null,
    encode: null,
    decode: null
  }

  defineNode()

  function defineNode () {
    var enc = [
      encodings.varint,
      encodings.bytes
    ]

    Node.encodingLength = encodingLength
    Node.encode = encode
    Node.decode = decode

    function encodingLength (obj) {
      var length = 0
      if (!defined(obj.index)) throw new Error("index is required")
      var len = enc[0].encodingLength(obj.index)
      length += 1 + len
      if (!defined(obj.hash)) throw new Error("hash is required")
      var len = enc[1].encodingLength(obj.hash)
      length += 1 + len
      if (!defined(obj.size)) throw new Error("size is required")
      var len = enc[0].encodingLength(obj.size)
      length += 1 + len
      return length
    }

    function encode (obj, buf, offset) {
      if (!offset) offset = 0
      if (!buf) buf = Buffer.allocUnsafe(encodingLength(obj))
      var oldOffset = offset
      if (!defined(obj.index)) throw new Error("index is required")
      buf[offset++] = 8
      enc[0].encode(obj.index, buf, offset)
      offset += enc[0].encode.bytes
      if (!defined(obj.hash)) throw new Error("hash is required")
      buf[offset++] = 18
      enc[1].encode(obj.hash, buf, offset)
      offset += enc[1].encode.bytes
      if (!defined(obj.size)) throw new Error("size is required")
      buf[offset++] = 24
      enc[0].encode(obj.size, buf, offset)
      offset += enc[0].encode.bytes
      encode.bytes = offset - oldOffset
      return buf
    }

    function decode (buf, offset, end) {
      if (!offset) offset = 0
      if (!end) end = buf.length
      if (!(end <= buf.length && offset <= buf.length)) throw new Error("Decoded message is not valid")
      var oldOffset = offset
      var obj = {
        index: 0,
        hash: null,
        size: 0
      }
      var found0 = false
      var found1 = false
      var found2 = false
      while (true) {
        if (end <= offset) {
          if (!found0 || !found1 || !found2) throw new Error("Decoded message is not valid")
          decode.bytes = offset - oldOffset
          return obj
        }
        var prefix = varint.decode(buf, offset)
        offset += varint.decode.bytes
        var tag = prefix >> 3
        switch (tag) {
          case 1:
          obj.index = enc[0].decode(buf, offset)
          offset += enc[0].decode.bytes
          found0 = true
          break
          case 2:
          obj.hash = enc[1].decode(buf, offset)
          offset += enc[1].decode.bytes
          found1 = true
          break
          case 3:
          obj.size = enc[0].decode(buf, offset)
          offset += enc[0].decode.bytes
          found2 = true
          break
          default:
          offset = skip(prefix & 7, buf, offset)
        }
      }
    }
  }

  var enc = [
    encodings.varint,
    encodings.bytes,
    Node
  ]

  Data.encodingLength = encodingLength
  Data.encode = encode
  Data.decode = decode

  function encodingLength (obj) {
    var length = 0
    if (!defined(obj.index)) throw new Error("index is required")
    var len = enc[0].encodingLength(obj.index)
    length += 1 + len
    if (defined(obj.value)) {
      var len = enc[1].encodingLength(obj.value)
      length += 1 + len
    }
    if (defined(obj.nodes)) {
      for (var i = 0; i < obj.nodes.length; i++) {
        if (!defined(obj.nodes[i])) continue
        var len = enc[2].encodingLength(obj.nodes[i])
        length += varint.encodingLength(len)
        length += 1 + len
      }
    }
    if (defined(obj.signature)) {
      var len = enc[1].encodingLength(obj.signature)
      length += 1 + len
    }
    return length
  }

  function encode (obj, buf, offset) {
    if (!offset) offset = 0
    if (!buf) buf = Buffer.allocUnsafe(encodingLength(obj))
    var oldOffset = offset
    if (!defined(obj.index)) throw new Error("index is required")
    buf[offset++] = 8
    enc[0].encode(obj.index, buf, offset)
    offset += enc[0].encode.bytes
    if (defined(obj.value)) {
      buf[offset++] = 18
      enc[1].encode(obj.value, buf, offset)
      offset += enc[1].encode.bytes
    }
    if (defined(obj.nodes)) {
      for (var i = 0; i < obj.nodes.length; i++) {
        if (!defined(obj.nodes[i])) continue
        buf[offset++] = 26
        varint.encode(enc[2].encodingLength(obj.nodes[i]), buf, offset)
        offset += varint.encode.bytes
        enc[2].encode(obj.nodes[i], buf, offset)
        offset += enc[2].encode.bytes
      }
    }
    if (defined(obj.signature)) {
      buf[offset++] = 34
      enc[1].encode(obj.signature, buf, offset)
      offset += enc[1].encode.bytes
    }
    encode.bytes = offset - oldOffset
    return buf
  }

  function decode (buf, offset, end) {
    if (!offset) offset = 0
    if (!end) end = buf.length
    if (!(end <= buf.length && offset <= buf.length)) throw new Error("Decoded message is not valid")
    var oldOffset = offset
    var obj = {
      index: 0,
      value: null,
      nodes: [],
      signature: null
    }
    var found0 = false
    while (true) {
      if (end <= offset) {
        if (!found0) throw new Error("Decoded message is not valid")
        decode.bytes = offset - oldOffset
        return obj
      }
      var prefix = varint.decode(buf, offset)
      offset += varint.decode.bytes
      var tag = prefix >> 3
      switch (tag) {
        case 1:
        obj.index = enc[0].decode(buf, offset)
        offset += enc[0].decode.bytes
        found0 = true
        break
        case 2:
        obj.value = enc[1].decode(buf, offset)
        offset += enc[1].decode.bytes
        break
        case 3:
        var len = varint.decode(buf, offset)
        offset += varint.decode.bytes
        obj.nodes.push(enc[2].decode(buf, offset, offset + len))
        offset += enc[2].decode.bytes
        break
        case 4:
        obj.signature = enc[1].decode(buf, offset)
        offset += enc[1].decode.bytes
        break
        default:
        offset = skip(prefix & 7, buf, offset)
      }
    }
  }
}

function defined (val) {
  return val !== null && val !== undefined && (typeof val !== 'number' || !isNaN(val))
}

}).call(this,require("buffer").Buffer)
},{"buffer":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/buffer/index.js","protocol-buffers-encodings":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/protocol-buffers-encodings/index.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hypercore-protocol/node_modules/varint/decode.js":[function(require,module,exports){
module.exports = read

var MSB = 0x80
  , REST = 0x7F

function read(buf, offset) {
  var res    = 0
    , offset = offset || 0
    , shift  = 0
    , counter = offset
    , b
    , l = buf.length

  do {
    if (counter >= l) {
      read.bytes = 0
      throw new RangeError('Could not decode varint')
    }
    b = buf[counter++]
    res += shift < 28
      ? (b & REST) << shift
      : (b & REST) * Math.pow(2, shift)
    shift += 7
  } while (b >= MSB)

  read.bytes = counter - offset

  return res
}

},{}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hypercore-protocol/node_modules/varint/encode.js":[function(require,module,exports){
module.exports = encode

var MSB = 0x80
  , REST = 0x7F
  , MSBALL = ~REST
  , INT = Math.pow(2, 31)

function encode(num, out, offset) {
  out = out || []
  offset = offset || 0
  var oldOffset = offset

  while(num >= INT) {
    out[offset++] = (num & 0xFF) | MSB
    num /= 128
  }
  while(num & MSBALL) {
    out[offset++] = (num & 0xFF) | MSB
    num >>>= 7
  }
  out[offset] = num | 0
  
  encode.bytes = offset - oldOffset + 1
  
  return out
}

},{}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hypercore-protocol/node_modules/varint/index.js":[function(require,module,exports){
module.exports = {
    encode: require('./encode.js')
  , decode: require('./decode.js')
  , encodingLength: require('./length.js')
}

},{"./decode.js":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hypercore-protocol/node_modules/varint/decode.js","./encode.js":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hypercore-protocol/node_modules/varint/encode.js","./length.js":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hypercore-protocol/node_modules/varint/length.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hypercore-protocol/node_modules/varint/length.js":[function(require,module,exports){

var N1 = Math.pow(2,  7)
var N2 = Math.pow(2, 14)
var N3 = Math.pow(2, 21)
var N4 = Math.pow(2, 28)
var N5 = Math.pow(2, 35)
var N6 = Math.pow(2, 42)
var N7 = Math.pow(2, 49)
var N8 = Math.pow(2, 56)
var N9 = Math.pow(2, 63)

module.exports = function (value) {
  return (
    value < N1 ? 1
  : value < N2 ? 2
  : value < N3 ? 3
  : value < N4 ? 4
  : value < N5 ? 5
  : value < N6 ? 6
  : value < N7 ? 7
  : value < N8 ? 8
  : value < N9 ? 9
  :              10
  )
}

},{}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hypercore/index.js":[function(require,module,exports){
(function (process,Buffer){
var low = require('last-one-wins')
var remove = require('unordered-array-remove')
var set = require('unordered-set')
var merkle = require('merkle-tree-stream/generator')
var flat = require('flat-tree')
var bulk = require('bulk-write-stream')
var from = require('from2')
var codecs = require('codecs')
var thunky = require('thunky')
var batcher = require('atomic-batcher')
var inherits = require('inherits')
var events = require('events')
var raf = require('random-access-file')
var bitfield = require('./lib/bitfield')
var sparseBitfield = require('sparse-bitfield')
var treeIndex = require('./lib/tree-index')
var storage = require('./lib/storage')
var crypto = require('hypercore-crypto')
var inspect = require('inspect-custom-symbol')
var pretty = require('pretty-hash')
var Nanoguard = require('nanoguard')
var safeBufferEquals = require('./lib/safe-buffer-equals')
var replicate = null

var defaultCrypto = {
  sign (data, sk, cb) {
    return cb(null, crypto.sign(data, sk))
  },

  verify (sig, data, pk, cb) {
    return cb(null, crypto.verify(sig, data, pk))
  }
}

module.exports = Feed

function Feed (createStorage, key, opts) {
  if (!(this instanceof Feed)) return new Feed(createStorage, key, opts)
  events.EventEmitter.call(this)

  if (typeof createStorage === 'string') createStorage = defaultStorage(createStorage)
  if (typeof createStorage !== 'function') throw new Error('Storage should be a function or string')

  if (typeof key === 'string') key = Buffer.from(key, 'hex')

  if (!Buffer.isBuffer(key) && !opts) {
    opts = key
    key = null
  }

  if (!opts) opts = {}

  var self = this

  var secretKey = opts.secretKey || null
  if (typeof secretKey === 'string') secretKey = Buffer.from(secretKey, 'hex')

  this.id = opts.id || crypto.randomBytes(32)
  this.live = opts.live !== false
  this.sparse = !!opts.sparse
  this.length = 0
  this.byteLength = 0
  this.maxRequests = opts.maxRequests || 16
  this.key = key || opts.key || null
  this.discoveryKey = this.key && crypto.discoveryKey(this.key)
  this.secretKey = secretKey
  this.bitfield = null
  this.tree = null
  this.writable = !!opts.writable
  this.readable = true
  this.opened = false
  this.closed = false
  this.allowPush = !!opts.allowPush
  this.peers = []
  this.ifAvailable = new Nanoguard()

  // Extensions must be sorted for handshaking to work
  this.extensions = (opts.extensions || []).sort()

  this.crypto = opts.crypto || defaultCrypto

  // hooks
  this._onwrite = opts.onwrite || null

  this._ready = thunky(open) // TODO: if open fails, do not reopen next time
  this._indexing = !!opts.indexing
  this._createIfMissing = opts.createIfMissing !== false
  this._overwrite = !!opts.overwrite
  this._storeSecretKey = opts.storeSecretKey !== false
  this._merkle = null
  this._storage = storage(createStorage, opts.storageCacheSize)
  this._batch = batcher(this._onwrite ? workHook : work)

  this._seq = 0
  this._waiting = []
  this._selections = []
  this._reserved = sparseBitfield()
  this._synced = null

  this._stats = (typeof opts.stats !== 'undefined' && !opts.stats) ? null : {
    downloadedBlocks: 0,
    downloadedBytes: 0,
    uploadedBlocks: 0,
    uploadedBytes: 0
  }

  this._codec = toCodec(opts.valueEncoding)
  this._sync = low(sync)
  if (!this.sparse) this.download({start: 0, end: -1})

  if (this.sparse && opts.eagerUpdate) {
    this.update(function loop (err) {
      if (err) this.emit('update-error', err)
      self.update(loop)
    })
  }

  // open it right away. TODO: do not reopen (i.e, set a flag not to retry)
  this._ready(onerror)

  function onerror (err) {
    if (err) self.emit('error', err)
  }

  function workHook (values, cb) {
    if (!self._merkle) return self._reloadMerkleStateBeforeAppend(workHook, values, cb)
    self._appendHook(values, cb)
  }

  function work (values, cb) {
    if (!self._merkle) return self._reloadMerkleStateBeforeAppend(work, values, cb)
    self._append(values, cb)
  }

  function sync (_, cb) {
    self._syncBitfield(cb)
  }

  function open (cb) {
    self._open(cb)
  }
}

inherits(Feed, events.EventEmitter)

Feed.discoveryKey = crypto.discoveryKey

Feed.prototype[inspect] = function (depth, opts) {
  var indent = ''
  if (typeof opts.indentationLvl === 'number') {
    while (indent.length < opts.indentationLvl) indent += ' '
  }
  return 'Hypercore(\n' +
    indent + '  key: ' + opts.stylize((this.key && pretty(this.key)), 'string') + '\n' +
    indent + '  discoveryKey: ' + opts.stylize((this.discoveryKey && pretty(this.discoveryKey)), 'string') + '\n' +
    indent + '  opened: ' + opts.stylize(this.opened, 'boolean') + '\n' +
    indent + '  sparse: ' + opts.stylize(this.sparse, 'boolean') + '\n' +
    indent + '  writable: ' + opts.stylize(this.writable, 'boolean') + '\n' +
    indent + '  length: ' + opts.stylize(this.length, 'number') + '\n' +
    indent + '  byteLength: ' + opts.stylize(this.byteLength, 'number') + '\n' +
    indent + '  peers: ' + opts.stylize(this.peers.length, 'number') + '\n' +
    indent + ')'
}

// TODO: instead of using a getter, update on remote-update/add/remove
Object.defineProperty(Feed.prototype, 'remoteLength', {
  enumerable: true,
  get: function () {
    var len = 0
    for (var i = 0; i < this.peers.length; i++) {
      var remoteLength = this.peers[i].remoteLength
      if (remoteLength > len) len = remoteLength
    }
    return len
  }
})

Object.defineProperty(Feed.prototype, 'stats', {
  enumerable: true,
  get: function () {
    if (!this._stats) return null
    var peerStats = []
    for (var i = 0; i < this.peers.length; i++) {
      var peer = this.peers[i]
      peerStats[i] = peer._stats
    }
    return {
      peers: peerStats,
      totals: this._stats
    }
  }
})

Feed.prototype.replicate = function (opts) {
  // Lazy load replication deps
  if (!replicate) replicate = require('./lib/replicate')

  if ((!this._selections.length || this._selections[0].end !== -1) && !this.sparse && !(opts && opts.live)) {
    // hack!! proper fix is to refactor ./replicate to *not* clear our non-sparse selection
    this.download({start: 0, end: -1})
  }

  opts = opts || {}
  opts.stats = !!this._stats

  if (!opts.extensions) opts.extensions = this.extensions

  var stream = replicate(this, opts)
  this.emit('replicating', stream)
  return stream
}

Feed.prototype.ready = function (onready) {
  this._ready(function (err) {
    if (!err) onready()
  })
}

Feed.prototype.update = function (opts, cb) {
  if (typeof opts === 'function') return this.update(-1, opts)
  if (typeof opts === 'number') opts = { minLength: opts }
  if (!opts) opts = {}
  if (!cb) cb = noop

  var self = this
  var len = typeof opts.minLength === 'number' ? opts.minLength : -1

  this.ready(function (err) {
    if (err) return cb(err)
    if (len === -1) len = self.length + 1
    if (self.length >= len) return cb(null)

    if (self.writable) cb = self._writeStateReloader(cb)

    var w = {
      hash: opts.hash !== false,
      bytes: 0,
      index: len - 1,
      update: true,
      options: opts,
      callback: cb
    }

    self._waiting.push(w)
    if (opts.ifAvailable) self._ifAvailable(w, len)
    self._updatePeers()
  })
}

Feed.prototype._ifAvailable = function (w, minLength) {
  var cb = w.callback
  var called = false
  var self = this

  w.callback = done

  this.ifAvailable.ready(function () {
    if (self.closed) return done(new Error('Closed'))
    if (self.length >= minLength || self.remoteLength >= minLength) return
    done(new Error('No update available from peers'))
  })

  function done (err) {
    if (called) return
    called = true

    var i = self._waiting.indexOf(w)
    if (i > -1) self._waiting.splice(i, 1)
    cb(err)
  }
}

Feed.prototype._ifAvailableGet = function (w) {
  var cb = w.callback
  var called = false
  var self = this

  w.callback = done

  this.ifAvailable.ready(function () {
    if (self.closed) return done(new Error('Closed'))
    for (var i = 0; i < self.peers.length; i++) {
      var peer = self.peers[i]
      if (peer.remoteBitfield.get(w.index)) return
    }
    done(new Error('Block not available from peers'))
  })

  function done (err, data) {
    if (called) return
    called = true

    var i = self._waiting.indexOf(w)
    if (i > -1) self._waiting.splice(i, 1)
    cb(err, data)
  }
}

// will reload the writable state. used by .update on a writable peer
Feed.prototype._writeStateReloader = function (cb) {
  var self = this
  return function (err) {
    if (err) return cb(err)
    self._reloadMerkleState(cb)
  }
}

Feed.prototype._reloadMerkleState = function (cb) {
  var self = this

  this._roots(self.length, function (err, roots) {
    if (err) return cb(err)
    self._merkle = merkle(crypto, roots)
    cb(null)
  })
}

Feed.prototype._reloadMerkleStateBeforeAppend = function (work, values, cb) {
  this._reloadMerkleState(function (err) {
    if (err) return cb(err)
    work(values, cb)
  })
}

Feed.prototype._open = function (cb) {
  var self = this
  var generatedKey = false
  var retryOpen = true

  // TODO: clean up the duplicate code below ...

  this._storage.openKey(function (_, key) {
    if (key && !self._overwrite && !self.key) self.key = key

    if (!self.key && self.live) {
      var keyPair = crypto.keyPair()
      self.secretKey = keyPair.secretKey
      self.key = keyPair.publicKey
      generatedKey = true
    }

    self.discoveryKey = self.key && crypto.discoveryKey(self.key)
    self._storage.open({key: self.key, discoveryKey: self.discoveryKey}, onopen)
  })

  function onopen (err, state) {
    if (err) return cb(err)

    // if no key but we have data do a bitfield reset since we cannot verify the data.
    if (!state.key && state.bitfield.length) {
      self._overwrite = true
    }

    if (self._overwrite) {
      state.bitfield = []
      state.key = state.secretKey = null
    }

    self.bitfield = bitfield(state.bitfieldPageSize, state.bitfield)
    self.tree = treeIndex(self.bitfield.tree)
    self.length = self.tree.blocks()
    self._seq = self.length

    if (state.key && self.key && Buffer.compare(state.key, self.key) !== 0) {
      return self._forceCloseAndError(cb, new Error('Another hypercore is stored here'))
    }

    if (state.key) self.key = state.key
    if (state.secretKey) self.secretKey = state.secretKey

    if (!self.length) return onsignature(null, null)
    self._storage.getSignature(self.length - 1, onsignature)

    function onsignature (_, sig) {
      if (self.length) self.live = !!sig

      if ((generatedKey || !self.key) && !self._createIfMissing) {
        return self._forceCloseAndError(cb, new Error('No hypercore is stored here'))
      }

      if (!self.key && self.live) {
        var keyPair = crypto.keyPair()
        self.secretKey = keyPair.secretKey
        self.key = keyPair.publicKey
      }

      var writable = !!self.secretKey || self.key === null

      if (!writable && self.writable) return self._forceCloseAndError(cb, new Error('Feed is not writable'))
      self.writable = writable
      self.discoveryKey = self.key && crypto.discoveryKey(self.key)

      if (self._storeSecretKey && !self.secretKey) {
        self._storeSecretKey = false
      }

      var shouldWriteKey = generatedKey || !safeBufferEquals(self.key, state.key)
      var shouldWriteSecretKey = self._storeSecretKey && (generatedKey || !safeBufferEquals(self.secretKey, state.secretKey))

      var missing = 1 +
        (shouldWriteKey ? 1 : 0) +
        (shouldWriteSecretKey ? 1 : 0) +
        (self._overwrite ? 1 : 0)
      var error = null

      if (shouldWriteKey) self._storage.key.write(0, self.key, done)
      if (shouldWriteSecretKey) self._storage.secretKey.write(0, self.secretKey, done)

      if (self._overwrite) {
        self._storage.bitfield.del(32, Infinity, done)
      }

      done(null)

      function done (err) {
        if (err) error = err
        if (--missing) return
        if (error) return self._forceCloseAndError(cb, error)
        self._roots(self.length, onroots)
      }

      function onroots (err, roots) {
        if (err && retryOpen) {
          retryOpen = false
          self.length--
          self._storage.getSignature(self.length - 1, onsignature)
          return
        }

        if (err) return self._forceCloseAndError(cb, err)

        self._merkle = merkle(crypto, roots)
        self.byteLength = roots.reduce(addSize, 0)
        self.opened = true
        self.emit('ready')

        cb(null)
      }
    }
  }
}

Feed.prototype.download = function (range, cb) {
  if (typeof range === 'function') return this.download(null, range)
  if (typeof range === 'number') range = {start: range, end: range + 1}
  if (!range) range = {}
  if (!cb) cb = noop
  if (!this.readable) return cb(new Error('Feed is closed'))

  // TODO: if no peers, check if range is already satisfied and nextTick(cb) if so
  // this._updatePeers does this for us when there is a peer though, so not critical

  var sel = {
    _index: this._selections.length,
    hash: !!range.hash,
    iterator: null,
    start: range.start || 0,
    end: range.end || -1,
    want: 0,
    linear: !!range.linear,
    callback: cb
  }

  sel.want = toWantRange(sel.start)

  this._selections.push(sel)
  this._updatePeers()

  return sel
}

Feed.prototype.undownload = function (range) {
  if (typeof range === 'number') range = {start: range, end: range + 1}
  if (!range) range = {}

  if (range.callback && range._index > -1) {
    set.remove(this._selections, range)
    process.nextTick(range.callback, createError('ECANCELED', -11, 'Download was cancelled'))
    return
  }

  var start = range.start || 0
  var end = range.end || -1
  var hash = !!range.hash
  var linear = !!range.linear

  for (var i = 0; i < this._selections.length; i++) {
    var s = this._selections[i]

    if (s.start === start && s.end === end && s.hash === hash && s.linear === linear) {
      set.remove(this._selections, s)
      process.nextTick(range.callback, createError('ECANCELED', -11, 'Download was cancelled'))
      return
    }
  }
}

Feed.prototype.digest = function (index) {
  return this.tree.digest(2 * index)
}

Feed.prototype.proof = function (index, opts, cb) {
  if (typeof opts === 'function') return this.proof(index, null, opts)
  if (!this.opened) return this._readyAndProof(index, opts, cb)
  if (!opts) opts = {}

  var proof = this.tree.proof(2 * index, opts)
  if (!proof) return cb(new Error('No proof available for this index'))

  var needsSig = this.live && !!proof.verifiedBy
  var pending = proof.nodes.length + (needsSig ? 1 : 0)
  var error = null
  var signature = null
  var nodes = new Array(proof.nodes.length)

  if (!pending) return cb(null, {nodes: nodes, signature: null})

  for (var i = 0; i < proof.nodes.length; i++) {
    this._storage.getNode(proof.nodes[i], onnode)
  }
  if (needsSig) {
    this._storage.getSignature(proof.verifiedBy / 2 - 1, onsignature)
  }

  function onsignature (err, sig) {
    if (sig) signature = sig
    onnode(err, null)
  }

  function onnode (err, node) {
    if (err) error = err

    if (node) {
      nodes[proof.nodes.indexOf(node.index)] = node
    }

    if (--pending) return
    if (error) return cb(error)
    cb(null, {nodes: nodes, signature: signature})
  }
}

Feed.prototype._readyAndProof = function (index, opts, cb) {
  var self = this
  this._ready(function (err) {
    if (err) return cb(err)
    self.proof(index, opts, cb)
  })
}

Feed.prototype.put = function (index, data, proof, cb) {
  if (!this.opened) return this._readyAndPut(index, data, proof, cb)
  this._putBuffer(index, this._codec.encode(data), proof, null, cb)
}

Feed.prototype.cancel = function (start, end) { // TODO: use same argument scheme as download
  if (!end) end = start + 1

  // cancel these right away as .download does not wait for ready
  for (var i = this._selections.length - 1; i >= 0; i--) {
    var sel = this._selections[i]
    if (start <= sel.start && sel.end <= end) {
      this.undownload(sel)
    }
  }

  // defer the last part until after ready as .get does that as well
  if (this.opened) this._cancel(start, end)
  else this._readyAndCancel(start, end)
}

Feed.prototype._cancel = function (start, end) {
  var i = 0

  for (i = start; i < end; i++) {
    this._reserved.set(i, false) // TODO: send cancel message if set returns true
  }

  for (i = this._waiting.length - 1; i >= 0; i--) {
    var w = this._waiting[i]
    if ((start <= w.start && w.end <= end) || (start <= w.index && w.index < end)) {
      remove(this._waiting, i)
      if (w.callback) process.nextTick(w.callback, new Error('Request cancelled'))
    }
  }
}

Feed.prototype.clear = function (start, end, opts, cb) { // TODO: use same argument scheme as download
  if (typeof end === 'function') return this.clear(start, start + 1, null, end)
  if (typeof opts === 'function') return this.clear(start, end, null, opts)
  if (!opts) opts = {}
  if (!end) end = start + 1
  if (!cb) cb = noop

  // TODO: this needs some work. fx we can only calc byte offset for blocks we know about
  // so internally we should make sure to only do that. We should use the merkle tree for this

  var self = this
  var byteOffset = start === 0 ? 0 : (typeof opts.byteOffset === 'number' ? opts.byteOffset : -1)
  var byteLength = typeof opts.byteLength === 'number' ? opts.byteLength : -1

  this._ready(function (err) {
    if (err) return cb(err)

    var modified = false

    // TODO: use a buffer.fill thing here to speed this up!

    for (var i = start; i < end; i++) {
      if (self.bitfield.set(i, false)) modified = true
    }

    if (!modified) return process.nextTick(cb)

    // TODO: write to a tmp/update file that we want to del this incase it crashes will del'ing

    self._unannounce({start: start, length: end - start})
    if (opts.delete === false || self._indexing) return sync()
    if (byteOffset > -1) return onstartbytes(null, byteOffset)
    self._storage.dataOffset(start, [], onstartbytes)

    function sync () {
      self.emit('clear', start, end)
      self._sync(null, cb)
    }

    function onstartbytes (err, offset) {
      if (err) return cb(err)
      byteOffset = offset
      if (byteLength > -1) return onendbytes(null, byteLength + byteOffset)
      if (end === self.length) return onendbytes(null, self.byteLength)
      self._storage.dataOffset(end, [], onendbytes)
    }

    function onendbytes (err, end) {
      if (err) return cb(err)
      if (!self._storage.data.del) return sync() // Not all data storage impls del
      self._storage.data.del(byteOffset, end - byteOffset, sync)
    }
  })
}

Feed.prototype.signature = function (index, cb) {
  if (typeof index === 'function') return this.signature(this.length - 1, index)

  if (index < 0 || index >= this.length) return cb(new Error('No signature available for this index'))

  this._storage.nextSignature(index, cb)
}

Feed.prototype.verify = function (index, signature, cb) {
  var self = this

  this.rootHashes(index, function (err, roots) {
    if (err) return cb(err)

    var checksum = crypto.tree(roots)

    self.crypto.verify(checksum, signature, self.key, function (err, valid) {
      if (err) return cb(err)

      if (!valid) return cb(new Error('Signature verification failed'))

      return cb(null, true)
    })
  })
}

Feed.prototype.rootHashes = function (index, cb) {
  this._getRootsToVerify(index * 2 + 2, {}, [], cb)
}

Feed.prototype.seek = function (bytes, opts, cb) {
  if (typeof opts === 'function') return this.seek(bytes, null, opts)
  if (!opts) opts = {}
  if (!this.opened) return this._readyAndSeek(bytes, opts, cb)

  var self = this

  if (bytes === this.byteLength) return process.nextTick(cb, null, this.length, 0)

  this._seek(bytes, function (err, index, offset) {
    if (!err && isBlock(index)) return done(index / 2, offset)
    if (opts.wait === false) return cb(err || new Error('Unable to seek to this offset'))

    var start = opts.start || 0
    var end = opts.end || -1

    if (!err) {
      var left = flat.leftSpan(index) / 2
      var right = flat.rightSpan(index) / 2 + 1

      if (left > start) start = left
      if (right < end || end === -1) end = right
    }

    if (end > -1 && end <= start) return cb(new Error('Unable to seek to this offset'))

    self._waiting.push({
      hash: opts.hash !== false,
      bytes: bytes,
      index: -1,
      start: start,
      end: end,
      want: toWantRange(start),
      callback: cb || noop
    })

    self._updatePeers()
  })

  function done (index, offset) {
    for (var i = 0; i < self.peers.length; i++) {
      self.peers[i].haveBytes(bytes)
    }
    cb(null, index, offset)
  }
}

Feed.prototype._seek = function (offset, cb) {
  if (offset === 0) return cb(null, 0, 0)

  var self = this
  var roots = flat.fullRoots(this.length * 2)
  var nearestRoot = 0

  loop(null, null)

  function onroot (top) {
    if (isBlock(top)) return cb(null, nearestRoot, offset)

    var left = flat.leftChild(top)
    while (!self.tree.get(left)) {
      if (isBlock(left)) return cb(null, nearestRoot, offset)
      left = flat.leftChild(left)
    }

    self._storage.getNode(left, onleftchild)
  }

  function onleftchild (err, node) {
    if (err) return cb(err)

    if (node.size > offset) {
      nearestRoot = node.index
      onroot(node.index)
    } else {
      offset -= node.size
      if (flat.parent(node.index) === nearestRoot) {
        nearestRoot = flat.sibling(node.index)
        onroot(nearestRoot)
      } else {
        onroot(flat.sibling(node.index))
      }
    }
  }

  function loop (err, node) {
    if (err) return cb(err)

    if (node) {
      if (node.size > offset) {
        nearestRoot = node.index
        return onroot(node.index)
      }
      offset -= node.size
    }

    if (!roots.length) return cb(new Error('Out of bounds'))
    self._storage.getNode(roots.shift(), loop)
  }
}

Feed.prototype._readyAndSeek = function (bytes, opts, cb) {
  var self = this
  this._ready(function (err) {
    if (err) return cb(err)
    self.seek(bytes, opts, cb)
  })
}

Feed.prototype._getBuffer = function (index, cb) {
  this._storage.getData(index, cb)
}

Feed.prototype._putBuffer = function (index, data, proof, from, cb) {
  // TODO: this nodes in proof are not instances of our Node prototype
  // but just similar. Check if this has any v8 perf implications.

  // TODO: if the proof contains a valid signature BUT fails, emit a critical error
  // --> feed should be considered dead

  var self = this
  var trusted = -1
  var missing = []
  var next = 2 * index
  var i = data ? 0 : 1

  while (true) {
    if (this.tree.get(next)) {
      trusted = next
      break
    }

    var sib = flat.sibling(next)
    next = flat.parent(next)

    if (i < proof.nodes.length && proof.nodes[i].index === sib) {
      i++
      continue
    }

    if (!this.tree.get(sib)) break
    missing.push(sib)
  }

  if (trusted === -1 && this.tree.get(next)) trusted = next

  var error = null
  var trustedNode = null
  var missingNodes = new Array(missing.length)
  var pending = missing.length + (trusted > -1 ? 1 : 0)

  for (i = 0; i < missing.length; i++) this._storage.getNode(missing[i], onmissing)
  if (trusted > -1) this._storage.getNode(trusted, ontrusted)
  if (!missing.length && trusted === -1) onmissingloaded(null)

  function ontrusted (err, node) {
    if (err) error = err
    if (node) trustedNode = node
    if (!--pending) onmissingloaded(error)
  }

  function onmissing (err, node) {
    if (err) error = err
    if (node) missingNodes[missing.indexOf(node.index)] = node
    if (!--pending) onmissingloaded(error)
  }

  function onmissingloaded (err) {
    if (err) return cb(err)
    self._verifyAndWrite(index, data, proof, missingNodes, trustedNode, from, cb)
  }
}

Feed.prototype._readyAndPut = function (index, data, proof, cb) {
  var self = this
  this._ready(function (err) {
    if (err) return cb(err)
    self.put(index, data, proof, cb)
  })
}

Feed.prototype._write = function (index, data, nodes, sig, from, cb) {
  if (!this._onwrite) return this._writeAfterHook(index, data, nodes, sig, from, cb)
  this._onwrite(index, data, from, writeHookDone(this, index, data, nodes, sig, from, cb))
}

function writeHookDone (self, index, data, nodes, sig, from, cb) {
  return function (err) {
    if (err) return cb(err)
    self._writeAfterHook(index, data, nodes, sig, from, cb)
  }
}

Feed.prototype._writeAfterHook = function (index, data, nodes, sig, from, cb) {
  var self = this
  var pending = nodes.length + 1 + (sig ? 1 : 0)
  var error = null

  for (var i = 0; i < nodes.length; i++) this._storage.putNode(nodes[i].index, nodes[i], ondone)
  if (data) this._storage.putData(index, data, nodes, ondone)
  else ondone()
  if (sig) this._storage.putSignature(sig.index, sig.signature, ondone)

  function ondone (err) {
    if (err) error = err
    if (--pending) return
    if (error) return cb(error)
    self._writeDone(index, data, nodes, from, cb)
  }
}

Feed.prototype._writeDone = function (index, data, nodes, from, cb) {
  for (var i = 0; i < nodes.length; i++) this.tree.set(nodes[i].index)
  this.tree.set(2 * index)

  if (data) {
    if (this.bitfield.set(index, true)) {
      if (this._stats) {
        this._stats.downloadedBlocks += 1
        this._stats.downloadedBytes += data.length
      }
      this.emit('download', index, data, from)
    }
    if (this.peers.length) this._announce({start: index}, from)

    if (!this.writable) {
      if (!this._synced) this._synced = this.bitfield.iterator(0, this.length)
      if (this._synced.next() === -1) {
        this._synced.range(0, this.length)
        this._synced.seek(0)
        if (this._synced.next() === -1) {
          this.emit('sync')
        }
      }
    }
  }

  this._sync(null, cb)
}

Feed.prototype._verifyAndWrite = function (index, data, proof, localNodes, trustedNode, from, cb) {
  var visited = []
  var remoteNodes = proof.nodes
  var top = data ? new storage.Node(2 * index, crypto.data(data), data.length) : remoteNodes.shift()

  // check if we already have the hash for this node
  if (verifyNode(trustedNode, top)) {
    this._write(index, data, visited, null, from, cb)
    return
  }

  // keep hashing with siblings until we reach or trusted node
  while (true) {
    var node = null
    var next = flat.sibling(top.index)

    if (remoteNodes.length && remoteNodes[0].index === next) {
      node = remoteNodes.shift()
      visited.push(node)
    } else if (localNodes.length && localNodes[0].index === next) {
      node = localNodes.shift()
    } else {
      // we cannot create another parent, i.e. these nodes must be roots in the tree
      this._verifyRootsAndWrite(index, data, top, proof, visited, from, cb)
      return
    }

    visited.push(top)
    top = new storage.Node(flat.parent(top.index), crypto.parent(top, node), top.size + node.size)

    // the tree checks out, write the data and the visited nodes
    if (verifyNode(trustedNode, top)) {
      this._write(index, data, visited, null, from, cb)
      return
    }
  }
}

Feed.prototype._verifyRootsAndWrite = function (index, data, top, proof, nodes, from, cb) {
  var remoteNodes = proof.nodes
  var lastNode = remoteNodes.length ? remoteNodes[remoteNodes.length - 1].index : top.index
  var verifiedBy = Math.max(flat.rightSpan(top.index), flat.rightSpan(lastNode)) + 2
  var self = this

  this._getRootsToVerify(verifiedBy, top, remoteNodes, function (err, roots, extraNodes) {
    if (err) return cb(err)

    var checksum = crypto.tree(roots)
    var signature = null

    if (self.length && self.live && !proof.signature) {
      return cb(new Error('Remote did not include a signature'))
    }

    if (proof.signature) { // check signatures
      self.crypto.verify(checksum, proof.signature, self.key, function (err, valid) {
        if (err) return cb(err)
        if (!valid) return cb(new Error('Remote signature could not be verified'))

        signature = {index: verifiedBy / 2 - 1, signature: proof.signature}
        write()
      })
    } else { // check tree root
      if (Buffer.compare(checksum, self.key) !== 0) {
        return cb(new Error('Remote checksum failed'))
      }

      write()
    }

    function write () {
      self.live = !!signature

      var length = verifiedBy / 2
      if (length > self.length) {
        // TODO: only emit this after the info has been flushed to storage
        if (self.writable) self._merkle = null // We need to reload merkle state now
        self.length = length
        self._seq = length
        self.byteLength = roots.reduce(addSize, 0)
        if (self._synced) self._synced.seek(0, self.length)
        self.emit('append')
      }

      self._write(index, data, nodes.concat(extraNodes), signature, from, cb)
    }
  })
}

Feed.prototype._getRootsToVerify = function (verifiedBy, top, remoteNodes, cb) {
  var indexes = flat.fullRoots(verifiedBy)
  var roots = new Array(indexes.length)
  var nodes = []
  var error = null
  var pending = roots.length

  for (var i = 0; i < indexes.length; i++) {
    if (indexes[i] === top.index) {
      nodes.push(top)
      onnode(null, top)
    } else if (remoteNodes.length && indexes[i] === remoteNodes[0].index) {
      nodes.push(remoteNodes[0])
      onnode(null, remoteNodes.shift())
    } else if (this.tree.get(indexes[i])) {
      this._storage.getNode(indexes[i], onnode)
    } else {
      onnode(new Error('Missing tree roots needed for verify'))
    }
  }

  function onnode (err, node) {
    if (err) error = err
    if (node) roots[indexes.indexOf(node.index)] = node
    if (!--pending) done(error)
  }

  function done (err) {
    if (err) return cb(err)

    cb(null, roots, nodes)
  }
}

Feed.prototype._announce = function (message, from) {
  for (var i = 0; i < this.peers.length; i++) {
    var peer = this.peers[i]
    if (peer !== from) peer.have(message)
  }
}

Feed.prototype._unannounce = function (message) {
  for (var i = 0; i < this.peers.length; i++) this.peers[i].unhave(message)
}

Feed.prototype.downloaded = function (start, end) {
  return this.bitfield.total(start, end)
}

Feed.prototype.has = function (start, end) {
  if (end === undefined) return this.bitfield.get(start)
  var total = end - start
  return total === this.bitfield.total(start, end)
}

Feed.prototype.head = function (opts, cb) {
  if (typeof opts === 'function') return this.head({}, opts)
  var self = this
  this._ready(function (err) {
    if (err) return cb(err)
    if (self.length === 0) cb(new Error('feed is empty'))
    else self.get(self.length - 1, opts, cb)
  })
}

Feed.prototype.get = function (index, opts, cb) {
  if (typeof opts === 'function') return this.get(index, null, opts)
  if (!this.opened) return this._readyAndGet(index, opts, cb)
  if (!this.readable) return cb(new Error('Feed is closed'))

  if (opts && opts.timeout) cb = timeoutCallback(cb, opts.timeout)

  if (!this.bitfield.get(index)) {
    if (opts && opts.wait === false) return cb(new Error('Block not downloaded'))

    var w = { bytes: 0, hash: false, index: index, options: opts, callback: cb }
    this._waiting.push(w)

    if (opts && opts.ifAvailable) this._ifAvailableGet(w)

    this._updatePeers()
    return
  }

  if (opts && opts.valueEncoding) cb = wrapCodec(toCodec(opts.valueEncoding), cb)
  else if (this._codec !== codecs.binary) cb = wrapCodec(this._codec, cb)

  this._getBuffer(index, cb)
}

Feed.prototype._readyAndGet = function (index, opts, cb) {
  var self = this
  this._ready(function (err) {
    if (err) return cb(err)
    self.get(index, opts, cb)
  })
}

Feed.prototype.getBatch = function (start, end, opts, cb) {
  if (typeof opts === 'function') return this.getBatch(start, end, null, opts)
  if (!this.opened) return this._readyAndGetBatch(start, end, opts, cb)

  var self = this
  var wait = !opts || opts.wait !== false

  if (this.has(start, end)) return this._getBatch(start, end, opts, cb)
  if (!wait) return cb(new Error('Block not downloaded'))

  if (opts && opts.timeout) cb = timeoutCallback(cb, opts.timeout)

  this.download({start: start, end: end}, function (err) {
    if (err) return cb(err)
    self._getBatch(start, end, opts, cb)
  })
}

Feed.prototype._getBatch = function (start, end, opts, cb) {
  var enc = opts && opts.valueEncoding
  var codec = enc ? toCodec(enc) : this._codec

  this._storage.getDataBatch(start, end - start, onbatch)

  function onbatch (err, buffers) {
    if (err) return cb(err)

    var batch = new Array(buffers.length)

    for (var i = 0; i < buffers.length; i++) {
      try {
        batch[i] = codec ? codec.decode(buffers[i]) : buffers[i]
      } catch (err) {
        return cb(err)
      }
    }

    cb(null, batch)
  }
}

Feed.prototype._readyAndGetBatch = function (start, end, opts, cb) {
  var self = this
  this._ready(function (err) {
    if (err) return cb(err)
    self.getBatch(start, end, opts, cb)
  })
}

Feed.prototype._updatePeers = function () {
  for (var i = 0; i < this.peers.length; i++) this.peers[i].update()
}

Feed.prototype.createWriteStream = function () {
  var self = this
  return bulk.obj(write)

  function write (batch, cb) {
    self.append(batch, cb)
  }
}

Feed.prototype.createReadStream = function (opts) {
  if (!opts) opts = {}

  var self = this
  var start = opts.start || 0
  var end = typeof opts.end === 'number' ? opts.end : -1
  var live = !!opts.live
  var snapshot = opts.snapshot !== false
  var first = true
  var range = this.download({start: start, end: end, linear: true})

  return from.obj(read).on('end', cleanup).on('close', cleanup)

  function read (size, cb) {
    if (!self.opened) return open(size, cb)
    if (!self.readable) return cb(new Error('Feed is closed'))

    if (first) {
      if (end === -1) {
        if (live) end = Infinity
        else if (snapshot) end = self.length
        if (start > end) return cb(null, null)
      }
      if (opts.tail) start = self.length
      first = false
    }

    if (start === end || (end === -1 && start === self.length)) return cb(null, null)

    range.start++
    if (range.iterator) range.iterator.start++

    self.get(start++, opts, cb)
  }

  function cleanup () {
    if (!range) return
    self.undownload(range)
    range = null
  }

  function open (size, cb) {
    self._ready(function (err) {
      if (err) return cb(err)
      read(size, cb)
    })
  }
}

// TODO: when calling finalize on a live feed write an END_OF_FEED block (length === 0?)
Feed.prototype.finalize = function (cb) {
  if (!this.key) {
    this.key = crypto.tree(this._merkle.roots)
    this.discoveryKey = crypto.discoveryKey(this.key)
  }
  this._storage.key.write(0, this.key, cb)
}

Feed.prototype.append = function (batch, cb) {
  if (!cb) cb = noop

  var self = this
  var list = Array.isArray(batch) ? batch : [batch]
  this._batch(list, onappend)

  function onappend (err) {
    if (err) return cb(err)
    var seq = self._seq
    self._seq += list.length
    cb(null, seq)
  }
}

Feed.prototype.flush = function (cb) {
  this.append([], cb)
}

Feed.prototype.close = function (cb) {
  var self = this

  this._ready(function () {
    self._forceCloseAndError(cb, null)
  })
}

Feed.prototype._forceCloseAndError = function (cb, error) {
  var self = this

  this.writable = false
  this.readable = false
  this._storage.close(function (err) {
    if (!err) err = error
    if (!self.closed && !err) self._onclose()
    if (cb) cb(err)
  })
}

Feed.prototype._onclose = function () {
  this.ifAvailable.destroy()
  this.closed = true

  while (this._waiting.length) {
    this._waiting.pop().callback(new Error('Feed is closed'))
  }
  while (this._selections.length) {
    this._selections.pop().callback(new Error('Feed is closed'))
  }

  this.emit('close')
}

Feed.prototype._appendHook = function (batch, cb) {
  var self = this
  var missing = batch.length
  var error = null

  if (!missing) return this._append(batch, cb)
  for (var i = 0; i < batch.length; i++) {
    this._onwrite(i + this.length, batch[i], null, done)
  }

  function done (err) {
    if (err) error = err
    if (--missing) return
    if (error) return cb(error)
    self._append(batch, cb)
  }
}

Feed.prototype._append = function (batch, cb) {
  if (!this.opened) return this._readyAndAppend(batch, cb)
  if (!this.writable) return cb(new Error('This feed is not writable. Did you create it?'))

  var self = this
  var pending = 1
  var offset = 0
  var error = null
  var nodeBatch = new Array(batch.length ? batch.length * 2 - 1 : 0)
  var nodeOffset = this.length * 2
  var dataBatch = new Array(batch.length)

  if (!pending) return cb()

  for (var i = 0; i < batch.length; i++) {
    var data = this._codec.encode(batch[i])
    var nodes = this._merkle.next(data)

    offset += data.length
    dataBatch[i] = data

    for (var j = 0; j < nodes.length; j++) {
      var node = nodes[j]
      if (node.index >= nodeOffset && node.index - nodeOffset < nodeBatch.length) {
        nodeBatch[node.index - nodeOffset] = node
      } else {
        pending++
        this._storage.putNode(node.index, node, done)
      }
    }
  }

  if (this.live && batch.length) {
    pending++
    this.crypto.sign(crypto.tree(this._merkle.roots), this.secretKey, function (err, sig) {
      if (err) return done(err)
      self._storage.putSignature(self.length + batch.length - 1, sig, done)
    })
  }

  if (!this._indexing) {
    pending++
    if (dataBatch.length === 1) this._storage.data.write(this.byteLength, dataBatch[0], done)
    else this._storage.data.write(this.byteLength, Buffer.concat(dataBatch), done)
  }

  this._storage.putNodeBatch(nodeOffset, nodeBatch, done)

  function done (err) {
    if (err) error = err
    if (--pending) return
    if (error) return cb(error)

    var start = self.length

    // TODO: only emit append and update length / byteLength after the info has been flushed to storage
    self.byteLength += offset
    for (var i = 0; i < batch.length; i++) {
      self.bitfield.set(self.length, true)
      self.tree.set(2 * self.length++)
    }
    self.emit('append')

    var message = self.length - start > 1 ? {start: start, length: self.length - start} : {start: start}
    if (self.peers.length) self._announce(message)

    self._sync(null, cb)
  }
}

Feed.prototype._readyAndAppend = function (batch, cb) {
  var self = this
  this._ready(function (err) {
    if (err) return cb(err)
    self._append(batch, cb)
  })
}

Feed.prototype._readyAndCancel = function (start, end) {
  var self = this
  this.ready(function () {
    self._cancel(start, end)
  })
}

Feed.prototype._pollWaiting = function () {
  var len = this._waiting.length
  for (var i = 0; i < len; i++) {
    var next = this._waiting[i]
    if (!next.bytes && !this.bitfield.get(next.index)) continue

    remove(this._waiting, i--)
    len--

    if (next.bytes) this.seek(next.bytes, next, next.callback)
    else if (next.update) this.update(next.index + 1, next.callback)
    else this.get(next.index, next.options, next.callback)
  }
}

Feed.prototype._syncBitfield = function (cb) {
  var missing = this.bitfield.pages.updates.length
  var next = null
  var error = null

  // All data / nodes have been written now. We still need to update the bitfields though

  // TODO 1: if the program fails during this write the bitfield might not have been fully written
  // HOWEVER, we can easily recover from this by traversing the tree and checking if the nodes exists
  // on disk. So if a get fails, it should try and recover once.

  // TODO 2: if .writable append bitfield updates into a single buffer for extra perf
  // Added benefit is that if the program exits while flushing the bitfield the feed will only get
  // truncated and not have missing chunks which is what you expect.

  if (!missing) {
    this._pollWaiting()
    return cb(null)
  }

  while ((next = this.bitfield.pages.lastUpdate()) !== null) {
    this._storage.putBitfield(next.offset, next.buffer, ondone)
  }

  this._pollWaiting()

  function ondone (err) {
    if (err) error = err
    if (--missing) return
    cb(error)
  }
}

Feed.prototype._roots = function (index, cb) {
  var roots = flat.fullRoots(2 * index)
  var result = new Array(roots.length)
  var pending = roots.length
  var error = null

  if (!pending) return cb(null, result)

  for (var i = 0; i < roots.length; i++) {
    this._storage.getNode(roots[i], onnode)
  }

  function onnode (err, node) {
    if (err) error = err
    if (node) result[roots.indexOf(node.index)] = node
    if (--pending) return
    if (error) return cb(error)
    cb(null, result)
  }
}

Feed.prototype.audit = function (cb) {
  if (!cb) cb = noop

  var self = this
  var report = {
    valid: 0,
    invalid: 0
  }

  this.ready(function (err) {
    if (err) return cb(err)

    var block = 0
    var max = self.length

    next()

    function onnode (err, node) {
      if (err) return ondata(null, null)
      self._storage.getData(block, ondata)

      function ondata (_, data) {
        var verified = data && crypto.data(data).equals(node.hash)
        if (verified) report.valid++
        else report.invalid++
        self.bitfield.set(block, verified)
        block++
        next()
      }
    }

    function next () {
      while (block < max && !self.bitfield.get(block)) block++
      if (block >= max) return done()
      self._storage.getNode(2 * block, onnode)
    }

    function done () {
      self._sync(null, function (err) {
        if (err) return cb(err)
        cb(null, report)
      })
    }
  })
}

Feed.prototype.extension = function (name, message) {
  var peers = this.peers

  for (var i = 0; i < peers.length; i++) {
    peers[i].extension(name, message)
  }
}

function noop () {}

function verifyNode (trusted, node) {
  return trusted && trusted.index === node.index && Buffer.compare(trusted.hash, node.hash) === 0
}

function addSize (size, node) {
  return size + node.size
}

function isBlock (index) {
  return (index & 1) === 0
}

function defaultStorage (dir) {
  return function (name) {
    try {
      var lock = name === 'bitfield' ? require('fd-lock') : null
    } catch (err) {}
    return raf(name, {directory: dir, lock: lock})
  }
}

function toCodec (enc) {
  // Switch to ndjson encoding if JSON is used. That way data files parse like ndjson \o/
  return codecs(enc === 'json' ? 'ndjson' : enc)
}

function wrapCodec (enc, cb) {
  return function (err, buf) {
    if (err) return cb(err)
    try {
      buf = enc.decode(buf)
    } catch (err) {
      return cb(err)
    }
    cb(null, buf)
  }
}

function timeoutCallback (cb, timeout) {
  var failed = false
  var id = setTimeout(ontimeout, timeout)
  return done

  function ontimeout () {
    failed = true
    // TODO: make libs/errors for all this stuff
    var err = new Error('ETIMEDOUT')
    err.code = 'ETIMEDOUT'
    cb(err)
  }

  function done (err, val) {
    if (failed) return
    clearTimeout(id)
    cb(err, val)
  }
}

function toWantRange (i) {
  return Math.floor(i / 1024 / 1024) * 1024 * 1024
}

function createError (code, errno, msg) {
  var err = new Error(msg)
  err.code = code
  err.errno = errno
  return err
}

}).call(this,require('_process'),require("buffer").Buffer)
},{"./lib/bitfield":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hypercore/lib/bitfield.js","./lib/replicate":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hypercore/lib/replicate.js","./lib/safe-buffer-equals":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hypercore/lib/safe-buffer-equals.js","./lib/storage":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hypercore/lib/storage.js","./lib/tree-index":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hypercore/lib/tree-index.js","_process":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/process/browser.js","atomic-batcher":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/atomic-batcher/index.js","buffer":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/buffer/index.js","bulk-write-stream":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/bulk-write-stream/index.js","codecs":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/codecs/index.js","events":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/browserify/node_modules/events/events.js","fd-lock":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/browser-resolve/empty.js","flat-tree":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/flat-tree/index.js","from2":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/from2/index.js","hypercore-crypto":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hypercore-crypto/index.js","inherits":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/inherits/inherits_browser.js","inspect-custom-symbol":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/inspect-custom-symbol/browser.js","last-one-wins":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/last-one-wins/index.js","merkle-tree-stream/generator":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/merkle-tree-stream/generator.js","nanoguard":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/nanoguard/index.js","pretty-hash":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/pretty-hash/index.js","random-access-file":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/random-access-file/browser.js","sparse-bitfield":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/sparse-bitfield/index.js","thunky":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/thunky/index.js","unordered-array-remove":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/unordered-array-remove/index.js","unordered-set":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/unordered-set/index.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hypercore/lib/bitfield.js":[function(require,module,exports){
(function (Buffer){
var flat = require('flat-tree')
var rle = require('bitfield-rle')
var pager = require('memory-pager')
var bitfield = require('sparse-bitfield')

var INDEX_UPDATE_MASK = [63, 207, 243, 252]
var INDEX_ITERATE_MASK = [0, 192, 240, 252]
var DATA_ITERATE_MASK = [128, 192, 224, 240, 248, 252, 254, 255]
var DATA_UPDATE_MASK = [127, 191, 223, 239, 247, 251, 253, 254]
var MAP_PARENT_RIGHT = new Array(256)
var MAP_PARENT_LEFT = new Array(256)
var NEXT_DATA_0_BIT = new Array(256)
var NEXT_INDEX_0_BIT = new Array(256)
var TOTAL_1_BITS = new Array(256)

for (var i = 0; i < 256; i++) {
  var a = (i & (15 << 4)) >> 4
  var b = i & 15
  var nibble = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4]
  MAP_PARENT_RIGHT[i] = ((a === 15 ? 3 : a === 0 ? 0 : 1) << 2) | (b === 15 ? 3 : b === 0 ? 0 : 1)
  MAP_PARENT_LEFT[i] = MAP_PARENT_RIGHT[i] << 4
  NEXT_DATA_0_BIT[i] = i === 255 ? -1 : (8 - Math.ceil(Math.log(256 - i) / Math.log(2)))
  NEXT_INDEX_0_BIT[i] = i === 255 ? -1 : Math.floor(NEXT_DATA_0_BIT[i] / 2)
  TOTAL_1_BITS[i] = nibble[i >> 4] + nibble[i & 0x0F]
}

module.exports = Bitfield

function Bitfield (pageSize, pages) {
  if (!(this instanceof Bitfield)) return new Bitfield(pageSize, pages)
  if (!pageSize) pageSize = 2048 + 1024 + 512

  var deduplicate = Buffer.allocUnsafe(pageSize)
  deduplicate.fill(255)

  this.indexSize = pageSize - 2048 - 1024
  this.pages = pager(pageSize, { deduplicate })

  if (pages) {
    for (var i = 0; i < pages.length; i++) {
      this.pages.set(i, pages[i])
    }
  }

  this.data = bitfield({
    pageSize: 1024,
    pageOffset: 0,
    pages: this.pages,
    trackUpdates: true
  })

  this.tree = bitfield({
    pageSize: 2048,
    pageOffset: 1024,
    pages: this.pages,
    trackUpdates: true
  })

  this.index = bitfield({
    pageSize: this.indexSize,
    pageOffset: 1024 + 2048,
    pages: this.pages,
    trackUpdates: true
  })

  this.length = this.data.length
  this._iterator = flat.iterator(0)
}

Bitfield.prototype.set = function (i, value) {
  var o = i & 7
  i = (i - o) / 8
  var v = value ? this.data.getByte(i) | (128 >> o) : this.data.getByte(i) & DATA_UPDATE_MASK[o]

  if (!this.data.setByte(i, v)) return false
  this.length = this.data.length
  this._setIndex(i, v)
  return true
}

Bitfield.prototype.get = function (i) {
  return this.data.get(i)
}

Bitfield.prototype.total = function (start, end) {
  if (!start || start < 0) start = 0
  if (!end) end = this.data.length
  if (end < start) return 0
  if (end > this.data.length) {
    this._expand(end)
  }
  var o = start & 7
  var e = end & 7
  var pos = (start - o) / 8
  var last = (end - e) / 8
  var leftMask = (255 - (o ? DATA_ITERATE_MASK[o - 1] : 0))
  var rightMask = (e ? DATA_ITERATE_MASK[e - 1] : 0)
  var byte = this.data.getByte(pos)
  if (pos === last) {
    return TOTAL_1_BITS[byte & leftMask & rightMask]
  }
  var total = TOTAL_1_BITS[byte & leftMask]
  for (var i = pos + 1; i < last; i++) {
    total += TOTAL_1_BITS[this.data.getByte(i)]
  }
  total += TOTAL_1_BITS[this.data.getByte(last) & rightMask]
  return total
}

// TODO: use the index to speed this up *a lot*
Bitfield.prototype.compress = function (start, length) {
  if (!start && !length) return rle.encode(this.data.toBuffer())

  var buf = Buffer.alloc(length)
  var p = start / this.data.pageSize / 8
  var end = p + length / this.data.pageSize / 8
  var offset = p * this.data.pageSize

  for (; p < end; p++) {
    var page = this.data.pages.get(p, true)
    if (!page || !page.buffer) continue
    page.buffer.copy(buf, p * this.data.pageSize - offset, this.data.pageOffset, this.data.pageOffset + this.data.pageSize)
  }

  return rle.encode(buf)
}

Bitfield.prototype._setIndex = function (i, value) {
  //                    (a + b | c + d | e + f | g + h)
  // -> (a | b | c | d)                                (e | f | g | h)
  //

  var o = i & 3
  i = (i - o) / 4

  var bitfield = this.index
  var ite = this._iterator
  var start = 2 * i
  var byte = (bitfield.getByte(start) & INDEX_UPDATE_MASK[o]) | (getIndexValue(value) >> (2 * o))
  var len = bitfield.length
  var maxLength = this.pages.length * this.indexSize

  ite.seek(start)

  while (ite.index < maxLength && bitfield.setByte(ite.index, byte)) {
    if (ite.isLeft()) {
      byte = MAP_PARENT_LEFT[byte] | MAP_PARENT_RIGHT[bitfield.getByte(ite.sibling())]
    } else {
      byte = MAP_PARENT_RIGHT[byte] | MAP_PARENT_LEFT[bitfield.getByte(ite.sibling())]
    }
    ite.parent()
  }

  if (len !== bitfield.length) this._expand(len)

  return ite.index !== start
}

Bitfield.prototype._expand = function (len) {
  var roots = flat.fullRoots(2 * len)
  var bitfield = this.index
  var ite = this._iterator
  var byte = 0

  for (var i = 0; i < roots.length; i++) {
    ite.seek(roots[i])
    byte = bitfield.getByte(ite.index)

    do {
      if (ite.isLeft()) {
        byte = MAP_PARENT_LEFT[byte] | MAP_PARENT_RIGHT[bitfield.getByte(ite.sibling())]
      } else {
        byte = MAP_PARENT_RIGHT[byte] | MAP_PARENT_LEFT[bitfield.getByte(ite.sibling())]
      }
    } while (setByteNoAlloc(bitfield, ite.parent(), byte))
  }
}

function setByteNoAlloc (bitfield, i, b) {
  if (8 * i >= bitfield.length) return false
  return bitfield.setByte(i, b)
}

Bitfield.prototype.iterator = function (start, end) {
  var ite = new Iterator(this)

  ite.range(start || 0, end || this.length)
  ite.seek(0)

  return ite
}

function Iterator (bitfield) {
  this.start = 0
  this.end = 0

  this._indexEnd = 0
  this._pos = 0
  this._byte = 0
  this._bitfield = bitfield
}

Iterator.prototype.range = function (start, end) {
  this.start = start
  this.end = end
  this._indexEnd = 2 * Math.ceil(end / 32)

  if (this.end > this._bitfield.length) {
    this._bitfield._expand(this.end)
  }

  return this
}

Iterator.prototype.seek = function (offset) {
  offset += this.start
  if (offset < this.start) offset = this.start

  if (offset >= this.end) {
    this._pos = -1
    return this
  }

  var o = offset & 7

  this._pos = (offset - o) / 8
  this._byte = this._bitfield.data.getByte(this._pos) | (o ? DATA_ITERATE_MASK[o - 1] : 0)

  return this
}

Iterator.prototype.random = function () {
  var i = this.seek(Math.floor(Math.random() * (this.end - this.start))).next()
  return i === -1 ? this.seek(0).next() : i
}

Iterator.prototype.next = function () {
  if (this._pos === -1) return -1

  var dataBitfield = this._bitfield.data
  var free = NEXT_DATA_0_BIT[this._byte]

  while (free === -1) {
    this._byte = dataBitfield.getByte(++this._pos)
    free = NEXT_DATA_0_BIT[this._byte]

    if (free === -1) {
      this._pos = this._skipAhead(this._pos)
      if (this._pos === -1) return -1

      this._byte = dataBitfield.getByte(this._pos)
      free = NEXT_DATA_0_BIT[this._byte]
    }
  }

  this._byte |= DATA_ITERATE_MASK[free]

  var n = 8 * this._pos + free
  return n < this.end ? n : -1
}

Iterator.prototype.peek = function () {
  if (this._pos === -1) return -1

  var free = NEXT_DATA_0_BIT[this._byte]
  var n = 8 * this._pos + free
  return n < this.end ? n : -1
}

Iterator.prototype._skipAhead = function (start) {
  var indexBitfield = this._bitfield.index
  var treeEnd = this._indexEnd
  var ite = this._bitfield._iterator
  var o = start & 3

  ite.seek(2 * ((start - o) / 4))

  var treeByte = indexBitfield.getByte(ite.index) | INDEX_ITERATE_MASK[o]

  while (NEXT_INDEX_0_BIT[treeByte] === -1) {
    if (ite.isLeft()) {
      ite.next()
    } else {
      ite.next()
      ite.parent()
    }

    if (rightSpan(ite) >= treeEnd) {
      while (rightSpan(ite) >= treeEnd && isParent(ite)) ite.leftChild()
      if (rightSpan(ite) >= treeEnd) return -1
    }

    treeByte = indexBitfield.getByte(ite.index)
  }

  while (ite.factor > 2) {
    if (NEXT_INDEX_0_BIT[treeByte] < 2) ite.leftChild()
    else ite.rightChild()

    treeByte = indexBitfield.getByte(ite.index)
  }

  var free = NEXT_INDEX_0_BIT[treeByte]
  if (free === -1) free = 4

  var next = ite.index * 2 + free

  return next <= start ? start + 1 : next
}

function rightSpan (ite) {
  return ite.index + ite.factor / 2 - 1
}

function isParent (ite) {
  return ite.index & 1
}

function getIndexValue (n) {
  switch (n) {
    case 255: return 192
    case 0: return 0
    default: return 64
  }
}

}).call(this,require("buffer").Buffer)
},{"bitfield-rle":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/bitfield-rle/index.js","buffer":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/buffer/index.js","flat-tree":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/flat-tree/index.js","memory-pager":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/memory-pager/index.js","sparse-bitfield":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/sparse-bitfield/index.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hypercore/lib/replicate.js":[function(require,module,exports){
var protocol = require('hypercore-protocol')
var bitfield = require('fast-bitfield')
var set = require('unordered-set')
var rle = require('bitfield-rle').align(4)
var safeBufferEquals = require('./safe-buffer-equals')
var treeIndex = require('./tree-index')

var EMPTY = new Uint8Array(1024)

module.exports = replicate

function replicate (feed, opts) {
  feed.ifAvailable.wait()
  var stream = opts.stream

  if (!stream) {
    if (!opts.expectedFeeds) opts.expectedFeeds = 1
    if (!opts.id) opts.id = feed.id
    stream = protocol(opts)
  }

  if (feed.opened) onready(null)
  else feed.ready(onready)

  return stream

  function onready (err) {
    feed.ifAvailable.continue()
    if (err) return stream.destroy(err)
    if (stream.destroyed) return

    var continueOnce = feed.ifAvailable.waitAndContinue()
    var peer = new Peer(feed, opts)
    peer.feed = feed
    peer.stream = stream.feed(feed.key, {peer: peer})

    peer.remoteId = stream.remoteId
    stream.setMaxListeners(0)
    stream.on('handshake', function () {
      if (safeBufferEquals(peer.remoteId, stream.remoteId)) {
        return
      }
      peer.remoteId = stream.remoteId
      if (!triggerReady()) {
        peer.feed.emit('remote-update', peer)
      }
      peer.remoteAck = stream.remoteAck
    })
    stream.on('close', continueOnce)
    stream.on('end', continueOnce)
    stream.on('error', continueOnce)
    var firstTime = true

    triggerReady()

    function triggerReady () {
      if (firstTime && peer.remoteId) {
        firstTime = false

        // stream might get destroyed on feed init in case of conf errors
        if (stream.destroyed) return false

        continueOnce()
        peer.ready()
        return true
      }
      return false
    }
  }
}

function Peer (feed, opts) {
  this.feed = feed
  this.stream = null // set by replicate just after creation
  this.remoteId = null
  this.wants = bitfield()
  this.remoteBitfield = bitfield()
  this.remoteLength = 0
  this.remoteWant = false
  this.remoteTree = null
  this.remoteAck = false
  this.live = !!opts.live
  this.sparse = feed.sparse
  this.ack = !!opts.ack

  this.remoteDownloading = true
  this.downloading = typeof opts.download === 'boolean' ? opts.download : !feed.writable
  this.uploading = true

  this.updated = false

  this.maxRequests = opts.maxRequests || feed.maxRequests || 16
  this.inflightRequests = []
  this.inflightWants = 0

  this._index = -1
  this._lastBytes = 0
  this._first = true
  this._closed = false
  this._destroyed = false
  this._defaultDownloading = this.downloading
  this._iterator = this.remoteBitfield.iterator()

  this._stats = !opts.stats ? null : {
    uploadedBytes: 0,
    uploadedBlocks: 0,
    downloadedBytes: 0,
    downloadedBlocks: 0
  }
}

Peer.prototype.onwant = function (want) {
  if ((want.start & 8191) || (want.length & 8191)) return
  if (!this.remoteWant && this.feed.length && this.feed.bitfield.get(this.feed.length - 1)) {
    // Eagerly send the length of the feed to the otherside
    // TODO: only send this if the remote is not wanting a region
    // where this is contained in
    this.stream.have({ start: this.feed.length - 1 })
  }
  this.remoteWant = true
  var rle = this.feed.bitfield.compress(want.start, want.length)
  this.stream.have({start: want.start, length: want.length, bitfield: rle})
}

Peer.prototype.ondata = function (data) {
  var self = this

  // Ignore unrequested messages unless we allow push
  // TODO: would be better to check if the byte range was requested instead, but this works fine
  var allowPush = this.feed.allowPush || !data.value
  if (!allowPush && !this.feed._reserved.get(data.index)) {
    // If we do not have this block, send back unhave message for this index,
    // to let the remote know we rejected it.
    // TODO: we might want to have some "unwanted push" threshold to punish spammers
    if (!self.feed.bitfield.get(data.index)) self.unhave({start: data.index})
    self._clear(data.index, !data.value)
    return
  }

  this.feed._putBuffer(data.index, data.value, data, this, function (err) {
    if (err) return self.destroy(err)
    if (data.value) self.remoteBitfield.set(data.index, false)
    if (self.remoteAck) {
      // Send acknowledgement.
      // In the future this could batch several ACKs at once
      self.stream.have({start: data.index, length: 1, ack: true})
    }
    if (self._stats && data.value) {
      self._stats.downloadedBlocks += 1
      self._stats.downloadedBytes += data.value.length
    }
    self._clear(data.index, !data.value)
  })
}

Peer.prototype._clear = function (index, hash) {
  // TODO: optimize me (no splice and do not run through all ...)
  for (var i = 0; i < this.inflightRequests.length; i++) {
    if (this.inflightRequests[i].index === index) {
      this.inflightRequests.splice(i, 1)
      i--
    }
  }

  this.feed._reserved.set(index, false)
  // TODO: only update all if we have overlapping selections
  this.feed._updatePeers()
}

Peer.prototype.onrequest = function (request) {
  if (request.bytes) return this._onbytes(request)

  // lazily instantiate the remote tree
  if (!this.remoteTree) this.remoteTree = treeIndex()

  var self = this
  var opts = {digest: request.nodes, hash: request.hash, tree: this.remoteTree}

  this.feed.proof(request.index, opts, onproof)

  function onproof (err, proof) {
    if (err) return self.destroy(err)
    if (request.hash) onvalue(null, null)
    else if (self.feed.bitfield.get(request.index)) self.feed._getBuffer(request.index, onvalue)

    function onvalue (err, value) {
      if (err) return self.destroy(err)

      if (value) {
        if (self._stats) {
          self._stats.uploadedBlocks += 1
          self._stats.uploadedBytes += value.length
          self.feed._stats.uploadedBlocks += 1
          self.feed._stats.uploadedBytes += value.length
        }
        self.feed.emit('upload', request.index, value, self)
      }

      // TODO: prob not needed with new bitfield
      if (request.index + 1 > self.remoteLength) {
        self.remoteLength = request.index + 1
        self._updateEnd()
      }

      self.stream.data({
        index: request.index,
        value: value,
        nodes: proof.nodes,
        signature: proof.signature
      })
    }
  }
}

Peer.prototype._onbytes = function (request) {
  var self = this

  this.feed.seek(request.bytes, {wait: false}, function (err, index) {
    if (err) {
      request.bytes = 0
      self.onrequest(request)
      return
    }

    // quick'n'dirty filter for parallel bytes requests
    // it does not matter that this doesn't catch ALL parallel requests - just a bandwidth optimization
    if (self._lastBytes === request.bytes) return
    self._lastBytes = request.bytes

    request.bytes = 0
    request.index = index
    request.nodes = 0

    self.onrequest(request)
  })
}

Peer.prototype.ontick = function () {
  if (!this.inflightRequests.length) return

  var first = this.inflightRequests[0]
  if (--first.tick) return

  if (first.hash ? this.feed.tree.get(2 * first.index) : this.feed.bitfield.get(first.index)) {
    // prob a bytes response
    this.inflightRequests.shift()
    this.feed._reserved.set(first.index, false)
    return
  }

  this.destroy(new Error('Request timeout'))
}

Peer.prototype.onhave = function (have) {
  if (this.ack && have.ack && !have.bitfield && this.feed.bitfield.get(have.start)) {
    this.stream.stream.emit('ack', have)
    return
  }

  var updated = this._first
  if (this._first) this._first = false

  if (have.length === 1024 * 1024) {
    this.feed.ifAvailable.continue()
    this.inflightWants--
  }

  if (have.bitfield) { // TODO: handle start !== 0
    if (have.length === 0 || have.length === 1) { // length === 1 is for backwards compat
      this.wants = null // we are in backwards compat mode where we subscribe everything
    }
    var buf = rle.decode(have.bitfield)
    var bits = buf.length * 8
    remoteAndNotLocal(this.feed.bitfield, buf, this.remoteBitfield.littleEndian, have.start)
    this.remoteBitfield.fill(buf, have.start)
    if (bits > this.remoteLength) {
      this.remoteLength = this.remoteBitfield.last() + 1
      updated = true
    }
  } else {
    // TODO: if len > something simply copy a 0b1111... buffer to the bitfield

    var start = have.start
    var len = have.length || 1

    while (len--) this.remoteBitfield.set(start, !this.feed.bitfield.get(start++))
    if (start > this.remoteLength) {
      this.remoteLength = start
      updated = true
    }
  }

  if (updated) {
    this.updated = true
    this.feed.emit('remote-update', this)
  }

  this._updateEnd()
  this.update()
}

Peer.prototype._updateEnd = function () {
  if (this.live || this.feed.sparse || !this.feed._selections.length) return

  var sel = this.feed._selections[0]
  var remoteLength = this.feed.length || -1

  for (var i = 0; i < this.feed.peers.length; i++) {
    if (this.feed.peers[i].remoteLength > remoteLength) {
      remoteLength = this.feed.peers[i].remoteLength
    }
  }

  sel.end = remoteLength
}

Peer.prototype.onextension = function (name, message) {
  this.feed.emit('extension', name, message, this)
}

Peer.prototype.oninfo = function (info) {
  this.remoteDownloading = info.downloading
  if (info.downloading || this.live) return
  this.update()
  if (this.feed._selections.length && this.downloading) return
  this.end()
}

Peer.prototype.onunhave = function (unhave) {
  var start = unhave.start
  var len = unhave.length || 1

  if (start === 0 && len >= this.remoteLength) {
    this.remoteLength = 0
    this.remoteBitfield = bitfield()
    return
  }

  while (len--) this.remoteBitfield.set(start++, false)
}

Peer.prototype.onunwant =
Peer.prototype.oncancel = function () {
  // TODO: impl all of me
}

Peer.prototype.onclose = function () {
  this.destroy()
}

Peer.prototype.have = function (have) { // called by feed
  if (this.stream && this.remoteWant) this.stream.have(have)
  var start = have.start
  var len = have.length
  while (len--) this.remoteBitfield.set(start++, false)
}

Peer.prototype.unhave = function (unhave) { // called by feed
  if (this.stream && this.remoteWant) this.stream.unhave(unhave)
}

Peer.prototype.haveBytes = function (bytes) { // called by feed
  for (var i = 0; i < this.inflightRequests.length; i++) {
    if (this.inflightRequests[i].bytes === bytes) {
      this.feed._reserved.set(this.inflightRequests[i].index, false)
      this.inflightRequests.splice(i, 1)
      i--
    }
  }

  this.update()
}

Peer.prototype.update = function () {
  // do nothing
  while (this._update()) {}
  this._sendWantsMaybe()
}

Peer.prototype._update = function () {
  // should return true if mutated false if not
  if (!this.downloading) return false

  var selections = this.feed._selections
  var waiting = this.feed._waiting
  var wlen = waiting.length
  var slen = selections.length
  var inflight = this.inflightRequests.length
  var offset = 0
  var i = 0

  // TODO: less duplicate code here
  // TODO: re-add priority levels

  while (inflight < this.maxRequests) {
    offset = Math.floor(Math.random() * waiting.length)

    for (i = 0; i < waiting.length; i++) {
      var w = waiting[offset++]
      if (offset === waiting.length) offset = 0

      this._downloadWaiting(w)
      if (waiting.length !== wlen) return true // mutated
      if (this.inflightRequests.length >= this.maxRequests) return false
    }
    if (inflight === this.inflightRequests.length) break
    inflight = this.inflightRequests.length
  }

  while (inflight < this.maxRequests) {
    offset = Math.floor(Math.random() * selections.length)

    for (i = 0; i < selections.length; i++) {
      var s = selections[offset++]
      if (offset === selections.length) offset = 0

      if (!s.iterator) s.iterator = this.feed.bitfield.iterator(s.start, s.end)
      this._downloadRange(s)
      if (selections.length !== slen) return true // mutated
      if (this.inflightRequests.length >= this.maxRequests) return false
    }

    if (inflight === this.inflightRequests.length) return false
    inflight = this.inflightRequests.length
  }

  return false
}

Peer.prototype.ready = function () {
  set.add(this.feed.peers, this)
  this._sendWants()
  this.feed.emit('peer-add', this)
}

Peer.prototype.end = function () {
  if (!this.downloading && !this.remoteDownloading && !this.live) {
    if (!this._defaultDownloading) {
      this.stream.info({downloading: false, uploading: false})
    }
    this._close()
    return
  }
  if (!this._closed) {
    this._closed = true
    this.downloading = false
    this.stream.info({downloading: false, uploading: true})
  } else {
    if (!this.live) this._close()
  }
}

Peer.prototype._close = function () {
  if (this._index === -1) return
  if (!this._destroyed) {
    this.stream.close()
    this._destroyed = true
  }
  set.remove(this.feed.peers, this)
  this._index = -1
  for (var i = 0; i < this.inflightRequests.length; i++) {
    this.feed._reserved.set(this.inflightRequests[i].index, false)
  }
  this._updateEnd()
  this.remoteWant = false
  this.feed._updatePeers()
  this.feed.emit('peer-remove', this)
  for (i = 0; i < this.inflightWants; i++) {
    this.feed.ifAvailable.continue()
  }
}

Peer.prototype.destroy = function (err) {
  if (this._index === -1 || this._destroyed) return
  this.stream.destroy(err)
  this._destroyed = true
  this._close()
}

Peer.prototype._sendWantsMaybe = function () {
  if (this.inflightRequests.length < this.maxRequests) this._sendWants()
}

Peer.prototype._sendWants = function () {
  if (!this.wants || !this.downloading) return
  if (this.inflightWants >= 16) return

  var i

  for (i = 0; i < this.feed._waiting.length; i++) {
    var w = this.feed._waiting[i]
    if (w.index === -1) this._sendWantRange(w)
    else this._sendWant(w.index)
    if (this.inflightWants >= 16) return
  }

  for (i = 0; i < this.feed._selections.length; i++) {
    var s = this.feed._selections[i]
    this._sendWantRange(s)
    if (this.inflightWants >= 16) return
  }

  // always sub to the first range for now, usually what you want
  this._sendWant(0)
}

Peer.prototype._sendWantRange = function (s) {
  var want = 0

  while (true) {
    if (want >= this.remoteLength) return
    if (s.end !== -1 && want >= s.end) return

    if (this._sendWant(want)) return

    // check if region is already selected - if so try next one
    if (!this.wants.get(Math.floor(want / 1024 / 1024))) return
    want += 1024 * 1024
  }
}

Peer.prototype._sendWant = function (index) {
  var len = 1024 * 1024
  var j = Math.floor(index / len)
  if (this.wants.get(j)) return false
  this.wants.set(j, true)
  this.inflightWants++
  this.feed.ifAvailable.wait()
  this.stream.want({start: j * len, length: len})
  return true
}

Peer.prototype._downloadWaiting = function (wait) {
  if (!wait.bytes) {
    if (!this.remoteBitfield.get(wait.index) || !this.feed._reserved.set(wait.index, true)) return
    this._request(wait.index, 0, false)
    return
  }

  this._downloadRange(wait)
}

Peer.prototype._downloadRange = function (range) {
  if (!range.iterator) range.iterator = this.feed.bitfield.iterator(range.start, range.end)

  var reserved = this.feed._reserved
  var ite = this._iterator
  var wantedEnd = Math.min(range.end === -1 ? this.remoteLength : range.end, this.remoteLength)

  var i = range.linear ? ite.seek(range.start).next(true) : nextRandom(ite, range.start, wantedEnd)
  var start = i

  if (i === -1 || i >= wantedEnd) {
    if (!range.bytes && range.end > -1 && this.feed.length >= range.end && range.iterator.seek(0).next() === -1) {
      set.remove(this.feed._selections, range)
      range.callback(null)
      if (!this.live && !this.sparse && !this.feed._selections.length) this.end()
    }
    return
  }

  while ((range.hash && this.feed.tree.get(2 * i)) || !reserved.set(i, true)) {
    i = ite.next(true)

    if (i > -1 && i < wantedEnd) {
      // check this index
      continue
    }

    if (!range.linear && start !== 0) {
      // retry from the beginning since we are iterating randomly and started !== 0
      i = ite.seek(range.start).next(true)
      start = 0
      if (i > -1 && i < wantedEnd) continue
    }

    // we have checked all indexes.
    // if we are looking for hashes we should check if we have all now (first check only checks blocks)
    if (range.hash) {
      // quick'n'dirty check if have all hashes - can be optimized be checking only tree roots
      // but we don't really request long ranges of hashes so yolo
      for (var j = range.start; j < wantedEnd; j++) {
        if (!this.feed.tree.get(2 * j)) return
      }
      if (!range.bytes) {
        set.remove(this.feed._selections, range)
        range.callback(null)
      }
    }

    // exit the update loop - nothing to do
    return
  }

  this._request(i, range.bytes || 0, range.hash)
}

Peer.prototype._request = function (index, bytes, hash) {
  var request = {
    tick: 6,
    bytes: bytes,
    index: index,
    hash: hash,
    nodes: this.feed.digest(index)
  }

  this.inflightRequests.push(request)
  this.stream.request(request)
}

Peer.prototype.extension = function (name, message) {
  this.stream.extension(name, message)
}

function createView (page) {
  var buf = page ? page.buffer : EMPTY
  return new DataView(buf.buffer, buf.byteOffset, 1024)
}

function remoteAndNotLocal (local, buf, le, start) {
  var remote = new DataView(buf.buffer, buf.byteOffset)
  var len = Math.floor(buf.length / 4)
  var arr = new Uint32Array(buf.buffer, buf.byteOffset, len)
  var p = start / 8192 // 8192 is bits per bitfield page
  var l = 0
  var page = createView(local.pages.get(p++, true))

  for (var i = 0; i < len; i++) {
    arr[i] = remote.getUint32(4 * i, !le) & ~page.getUint32(4 * (l++), !le)

    if (l === 256) {
      page = createView(local.pages.get(p++, true))
      l = 0
    }
  }
}

function nextRandom (ite, start, end) {
  var len = end - start
  var i = ite.seek(Math.floor(Math.random() * len) + start).next(true)
  return i === -1 || i >= end ? ite.seek(start).next(true) : i
}

},{"./safe-buffer-equals":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hypercore/lib/safe-buffer-equals.js","./tree-index":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hypercore/lib/tree-index.js","bitfield-rle":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/bitfield-rle/index.js","fast-bitfield":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/fast-bitfield/index.js","hypercore-protocol":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hypercore-protocol/index.js","unordered-set":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/unordered-set/index.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hypercore/lib/safe-buffer-equals.js":[function(require,module,exports){
(function (Buffer){
// buffer-equals, but handle 'null' buffer parameters.
module.exports = function safeBufferEquals (a, b) {
  if (!a) return !b
  if (!b) return !a
  return Buffer.compare(a, b) === 0
}

}).call(this,require("buffer").Buffer)
},{"buffer":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/buffer/index.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hypercore/lib/storage.js":[function(require,module,exports){
(function (Buffer){
var uint64be = require('uint64be')
var flat = require('flat-tree')
var alru = require('array-lru')

module.exports = Storage

var noarr = []

function Storage (create, cacheSize) {
  if (!(this instanceof Storage)) return new Storage(create, cacheSize)
  cacheSize = typeof cacheSize === 'undefined' ? 65536 : cacheSize

  this.cache = cacheSize > 0 ? alru(cacheSize, {indexedValues: true}) : null
  this.key = null
  this.secretKey = null
  this.tree = null
  this.data = null
  this.bitfield = null
  this.signatures = null
  this.create = create
}

Storage.prototype.putData = function (index, data, nodes, cb) {
  if (!cb) cb = noop
  var self = this
  if (!data.length) return cb(null)
  this.dataOffset(index, nodes, function (err, offset, size) {
    if (err) return cb(err)
    if (size !== data.length) return cb(new Error('Unexpected data size'))
    self.data.write(offset, data, cb)
  })
}

Storage.prototype.getData = function (index, cb) {
  var self = this
  this.dataOffset(index, noarr, function (err, offset, size) {
    if (err) return cb(err)
    self.data.read(offset, size, cb)
  })
}

Storage.prototype.nextSignature = function (index, cb) {
  var self = this

  this._getSignature(index, function (err, signature) {
    if (err) return cb(err)
    if (isBlank(signature)) return self.nextSignature(index + 1, cb)
    cb(null, { index: index, signature: signature })
  })
}

Storage.prototype.getSignature = function (index, cb) {
  this._getSignature(index, function (err, signature) {
    if (err) return cb(err)
    if (isBlank(signature)) return cb(new Error('No signature found'))
    cb(null, signature)
  })
}

Storage.prototype._getSignature = function (index, cb) {
  this.signatures.read(32 + 64 * index, 64, cb)
}

Storage.prototype.putSignature = function (index, signature, cb) {
  this.signatures.write(32 + 64 * index, signature, cb)
}

Storage.prototype.dataOffset = function (index, cachedNodes, cb) {
  var roots = flat.fullRoots(2 * index)
  var self = this
  var offset = 0
  var pending = roots.length
  var error = null
  var blk = 2 * index

  if (!pending) {
    pending = 1
    onnode(null, null)
    return
  }

  for (var i = 0; i < roots.length; i++) {
    var node = findNode(cachedNodes, roots[i])
    if (node) onnode(null, node)
    else this.getNode(roots[i], onnode)
  }

  function onlast (err, node) {
    if (err) return cb(err)
    cb(null, offset, node.size)
  }

  function onnode (err, node) {
    if (err) error = err
    if (node) offset += node.size
    if (--pending) return

    if (error) return cb(error)

    var last = findNode(cachedNodes, blk)
    if (last) onlast(null, last)
    else self.getNode(blk, onlast)
  }
}

Storage.prototype.getDataBatch = function (start, n, cb) {
  var result = new Array(n)
  var sizes = new Array(n)
  var self = this

  this.dataOffset(start, noarr, function (err, offset, size) {
    if (err) return cb(err)

    start++
    n--

    if (n <= 0) return ontree(null, null)
    self.tree.read(32 + 80 * start, 80 * n - 40, ontree)

    function ontree (err, buf) {
      if (err) return cb(err)

      var total = sizes[0] = size

      if (buf) {
        for (var i = 1; i < sizes.length; i++) {
          sizes[i] = uint64be.decode(buf, 32 + (i - 1) * 80)
          total += sizes[i]
        }
      }

      self.data.read(offset, total, ondata)
    }

    function ondata (err, buf) {
      if (err) return cb(err)
      var total = 0
      for (var i = 0; i < result.length; i++) {
        result[i] = buf.slice(total, total += sizes[i])
      }

      cb(null, result)
    }
  })
}

Storage.prototype.getNode = function (index, cb) {
  if (this.cache) {
    var cached = this.cache.get(index)
    if (cached) return cb(null, cached)
  }

  var self = this

  this.tree.read(32 + 40 * index, 40, function (err, buf) {
    if (err) return cb(err)

    var hash = buf.slice(0, 32)
    var size = uint64be.decode(buf, 32)

    if (!size && isBlank(hash)) return cb(new Error('No node found'))

    var val = new Node(index, hash, size, null)
    if (self.cache) self.cache.set(index, val)
    cb(null, val)
  })
}

Storage.prototype.putNodeBatch = function (index, nodes, cb) {
  if (!cb) cb = noop

  var buf = Buffer.alloc(nodes.length * 40)

  for (var i = 0; i < nodes.length; i++) {
    var offset = i * 40
    var node = nodes[i]
    if (!node) continue
    node.hash.copy(buf, offset)
    uint64be.encode(node.size, buf, 32 + offset)
  }

  this.tree.write(32 + 40 * index, buf, cb)
}

Storage.prototype.putNode = function (index, node, cb) {
  if (!cb) cb = noop

  // TODO: re-enable put cache. currently this causes a memleak
  // because node.hash is a slice of the big data buffer on replicate
  // if (this.cache) this.cache.set(index, node)

  var buf = Buffer.allocUnsafe(40)

  node.hash.copy(buf, 0)
  uint64be.encode(node.size, buf, 32)
  this.tree.write(32 + 40 * index, buf, cb)
}

Storage.prototype.putBitfield = function (offset, data, cb) {
  this.bitfield.write(32 + offset, data, cb)
}

Storage.prototype.close = function (cb) {
  if (!cb) cb = noop
  var missing = 6
  var error = null

  close(this.bitfield, done)
  close(this.tree, done)
  close(this.data, done)
  close(this.key, done)
  close(this.secretKey, done)
  close(this.signatures, done)

  function done (err) {
    if (err) error = err
    if (--missing) return
    cb(error)
  }
}

Storage.prototype.openKey = function (opts, cb) {
  if (typeof opts === 'function') return this.openKey({}, opts)
  if (!this.key) this.key = this.create('key', opts)
  this.key.read(0, 32, cb)
}

Storage.prototype.open = function (opts, cb) {
  if (typeof opts === 'function') return this.open({}, opts)

  var self = this
  var error = null
  var missing = 5

  if (!this.key) this.key = this.create('key', opts)
  if (!this.secretKey) this.secretKey = this.create('secret_key', opts)
  if (!this.tree) this.tree = this.create('tree', opts)
  if (!this.data) this.data = this.create('data', opts)
  if (!this.bitfield) this.bitfield = this.create('bitfield', opts)
  if (!this.signatures) this.signatures = this.create('signatures', opts)

  var result = {
    bitfield: [],
    bitfieldPageSize: 3584, // we upgraded the page size to fix a bug
    secretKey: null,
    key: null
  }

  this.bitfield.read(0, 32, function (_, h) {
    if (h) result.bitfieldPageSize = h.readUInt16BE(5)
    self.bitfield.write(0, header(0, result.bitfieldPageSize, null), function (err) {
      if (err) return cb(err)
      readAll(self.bitfield, 32, result.bitfieldPageSize, function (err, pages) {
        if (pages) result.bitfield = pages
        done(err)
      })
    })
  })

  this.signatures.write(0, header(1, 64, 'Ed25519'), done)
  this.tree.write(0, header(2, 40, 'BLAKE2b'), done)

  // TODO: Improve the error handling here.
  // I.e. if secretKey length === 64 and it fails, error

  this.secretKey.read(0, 64, function (_, data) {
    if (data) result.secretKey = data
    done(null)
  })

  this.key.read(0, 32, function (_, data) {
    if (data) result.key = data
    done(null)
  })

  function done (err) {
    if (err) error = err
    if (--missing) return
    if (error) cb(error)
    else cb(null, result)
  }
}

Storage.Node = Node

function noop () {}

function header (type, size, name) {
  var buf = Buffer.alloc(32)

  // magic number
  buf[0] = 5
  buf[1] = 2
  buf[2] = 87
  buf[3] = type

  // version
  buf[4] = 0

  // block size
  buf.writeUInt16BE(size, 5)

  if (name) {
    // algo name
    buf[7] = name.length
    buf.write(name, 8)
  }

  return buf
}

function Node (index, hash, size) {
  this.index = index
  this.hash = hash
  this.size = size
}

function findNode (nodes, index) {
  for (var i = 0; i < nodes.length; i++) {
    if (nodes[i].index === index) return nodes[i]
  }
  return null
}

function isBlank (buf) {
  for (var i = 0; i < buf.length; i++) {
    if (buf[i]) return false
  }
  return true
}

function close (st, cb) {
  if (st.close) st.close(cb)
  else cb()
}

function statAndReadAll (st, offset, pageSize, cb) {
  st.stat(function (err, stat) {
    if (err) return cb(null, [])

    var result = []

    loop(null, null)

    function loop (err, batch) {
      if (err) return cb(err)

      if (batch) {
        offset += batch.length
        for (var i = 0; i < batch.length; i += pageSize) {
          result.push(batch.slice(i, i + pageSize))
        }
      }

      var next = Math.min(stat.size - offset, 32 * pageSize)
      if (!next) return cb(null, result)

      st.read(offset, next, loop)
    }
  })
}

function readAll (st, offset, pageSize, cb) {
  if (st.statable === true) return statAndReadAll(st, offset, pageSize, cb)

  var bufs = []

  st.read(offset, pageSize, loop)

  function loop (err, buf) {
    if (err) return cb(null, bufs)
    bufs.push(buf)
    st.read(offset + bufs.length * pageSize, pageSize, loop)
  }
}

}).call(this,require("buffer").Buffer)
},{"array-lru":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/array-lru/index.js","buffer":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/buffer/index.js","flat-tree":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/flat-tree/index.js","uint64be":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/uint64be/index.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hypercore/lib/tree-index.js":[function(require,module,exports){
var flat = require('flat-tree')
var bitfield = require('sparse-bitfield')

module.exports = TreeIndex

function TreeIndex (bits) {
  if (!(this instanceof TreeIndex)) return new TreeIndex(bits)
  this.bitfield = bits || bitfield()
}

TreeIndex.prototype.proof = function (index, opts) {
  if (!opts) opts = {}

  var nodes = []
  var remoteTree = opts.tree || new TreeIndex()
  var digest = opts.digest || 0

  if (!this.get(index)) return null
  if (opts.hash) nodes.push(index) // always return hash - no matter what the digest says
  if (digest === 1) return {nodes: nodes, verifiedBy: 0}

  var roots = null
  var sibling = index
  var next = index
  var hasRoot = digest & 1
  digest = rightShift(digest)

  while (digest) {
    if (digest === 1 && hasRoot) {
      if (this.get(next)) remoteTree.set(next)

      // having a root implies having prev roots as well
      // TODO: this can be optimized away be only sending "newer" roots,
      // when sending roots
      if (flat.sibling(next) < next) next = flat.sibling(next)
      roots = flat.fullRoots(flat.rightSpan(next) + 2)
      for (var i = 0; i < roots.length; i++) {
        if (this.get(roots[i])) remoteTree.set(roots[i])
      }
      break
    }

    sibling = flat.sibling(next)
    if (digest & 1) {
      if (this.get(sibling)) remoteTree.set(sibling)
    }
    next = flat.parent(next)
    digest = rightShift(digest)
  }

  next = index

  while (!remoteTree.get(next)) {
    sibling = flat.sibling(next)
    if (!this.get(sibling)) {
      // next is a local root
      var verifiedBy = this.verifiedBy(next)
      addFullRoots(verifiedBy, nodes, next, remoteTree)
      return {nodes: nodes, verifiedBy: verifiedBy}
    } else {
      if (!remoteTree.get(sibling)) nodes.push(sibling)
    }

    next = flat.parent(next)
  }

  return {nodes: nodes, verifiedBy: 0}
}

TreeIndex.prototype.digest = function (index) {
  if (this.get(index)) return 1

  var digest = 0
  var next = flat.sibling(index)
  var max = Math.max(next + 2, this.bitfield.length) // TODO: make this less ... hacky

  var bit = 2
  var depth = flat.depth(index)
  var parent = flat.parent(next, depth++)

  while (flat.rightSpan(next) < max || flat.leftSpan(parent) > 0) {
    if (this.get(next)) {
      digest += bit // + cause in this case it's the same as | but works for large nums
    }
    if (this.get(parent)) {
      digest += 2 * bit
      if (!(digest & 1)) digest += 1
      if (digest + 1 === 4 * bit) return 1
      return digest
    }
    next = flat.sibling(parent)
    parent = flat.parent(next, depth++)
    bit *= 2
  }

  return digest
}

TreeIndex.prototype.blocks = function () {
  var top = 0
  var next = 0
  var max = this.bitfield.length

  while (flat.rightSpan(next) < max) {
    next = flat.parent(next)
    if (this.get(next)) top = next
  }

  return (this.get(top) ? this.verifiedBy(top) : 0) / 2
}

TreeIndex.prototype.roots = function () {
  return flat.fullRoots(2 * this.blocks())
}

TreeIndex.prototype.verifiedBy = function (index, nodes) {
  var hasIndex = this.get(index)
  if (!hasIndex) return 0

  // find root of current tree

  var depth = flat.depth(index)
  var top = index
  var parent = flat.parent(top, depth++)
  while (this.get(parent) && this.get(flat.sibling(top))) {
    top = parent
    parent = flat.parent(top, depth++)
  }

  // expand right down

  depth--
  while (depth) {
    top = flat.leftChild(flat.index(depth, flat.offset(top, depth) + 1), depth)
    depth--

    while (!this.get(top) && depth) top = flat.leftChild(top, depth--)
    if (nodes && this.get(top)) nodes.push(top)
  }

  return this.get(top) ? top + 2 : top
}

TreeIndex.prototype.get = function (index) {
  return this.bitfield.get(index)
}

TreeIndex.prototype.set = function (index) {
  if (!this.bitfield.set(index, true)) return false
  while (this.bitfield.get(flat.sibling(index))) {
    index = flat.parent(index)
    if (!this.bitfield.set(index, true)) break
  }
  return true
}

function rightShift (n) {
  return (n - (n & 1)) / 2
}

function addFullRoots (verifiedBy, nodes, root, remoteTree) {
  var roots = flat.fullRoots(verifiedBy)
  for (var i = 0; i < roots.length; i++) {
    if (roots[i] !== root && !remoteTree.get(roots[i])) nodes.push(roots[i])
  }
}

},{"flat-tree":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/flat-tree/index.js","sparse-bitfield":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/sparse-bitfield/index.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hyperscript-attribute-to-property/index.js":[function(require,module,exports){
module.exports = attributeToProperty

var transform = {
  'class': 'className',
  'for': 'htmlFor',
  'http-equiv': 'httpEquiv'
}

function attributeToProperty (h) {
  return function (tagName, attrs, children) {
    for (var attr in attrs) {
      if (attr in transform) {
        attrs[transform[attr]] = attrs[attr]
        delete attrs[attr]
      }
    }
    return h(tagName, attrs, children)
  }
}

},{}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hyperswarm-proxy-ws/client.js":[function(require,module,exports){
const HyperswarmProxyClient = require('hyperswarm-proxy/client')
const websocket = require('websocket-stream')

const DEFAULT_PORT = '4977' // HYPR on a cellphone keypad
const LOCAL_PROXY = `ws://localhost:${DEFAULT_PORT}`
const DEFAULT_PROXY = LOCAL_PROXY
const DEFAULT_RECONNECT_DELAY = 1000

class HyperswarmProxyWSClient extends HyperswarmProxyClient {
  constructor (opts = {}) {
    super(opts)

    const { proxy = DEFAULT_PROXY, reconnectDelay = DEFAULT_RECONNECT_DELAY } = opts

    this.proxy = proxy
    this.reconnectDelay = reconnectDelay

    this.reconnect()
  }

  reconnect () {
    const localSocket = websocket(LOCAL_PROXY)

    // Re-emit errors
    localSocket.on('error', (e) => this.emit('connection-error', e))

    localSocket.once('error', () => {
      // Couldn't connect to a local proxy
      // Attempt to connect to the internet proxy
      const proxySocket = websocket(this.proxy)

      // Re-emit errors
      proxySocket.on('error', (e) => this.emit('connection-error', e))

      proxySocket.once('close', () => {
        setTimeout(() => {
          if (this.destroyed) return
          this.reconnect()
        }, this.reconnectDelay)
      })

      super.reconnect(proxySocket)
    })
    super.reconnect(localSocket)
  }
}

module.exports = HyperswarmProxyWSClient

},{"hyperswarm-proxy/client":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hyperswarm-proxy/client.js","websocket-stream":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/websocket-stream/stream.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hyperswarm-proxy/client.js":[function(require,module,exports){
(function (process){
const EventEmitter = require('events')
const HyperswarmProxyStream = require('./')

const NOT_CONNECTED = 'Not connected to proxy'

module.exports = class HyperswarmProxyClient extends EventEmitter {
  constructor (options = {}) {
    super()

    const { connection, autoconnect = true, maxPeers = 24 } = options

    this.maxPeers = maxPeers

    this._handleStream = this._handleStream.bind(this)
    this._handleClose = this._handleClose.bind(this)
    this._handlePeer = this._handlePeer.bind(this)
    this._handleError = this._handleError.bind(this)
    this._reJoin = this._reJoin.bind(this)

    this._protocol = null
    this._connection = null

    this._topics = []
    this._connectedPeers = new Set()
    this._seenPeers = []

    this._autoconnect = autoconnect

    this.destroyed = false

    if (connection) {
      this.reconnect(connection)
    }
  }

  disconnect() {
    if(!this._protocol) {
      return
    }
    this._protocol.removeListener('close', this._handleClose)
    this._connection.end()
    this._protocol.end()

    this._connection = null
    this._protocol = null
  }

  reconnect (connection) {
    this.disconnect()

    this._connection = connection
    this._protocol = new HyperswarmProxyStream(connection)

    this._protocol.on('stream', this._handleStream)
    this._protocol.on('on_peer', this._handlePeer)
    this._protocol.once('close', this._handleClose)
    this._protocol.on('error', this._handleError)

    // Once the other side is ready, re-join known topics
    this._protocol.once('ready', this._reJoin)

    this._protocol.ready()
  }

  _handleStream (stream, { topic, peer }) {
    if(this.destroyed) {
      // Already destroyed
      stream.end()
      return
    }

    const details = {
      type: 'proxy',
      client: true,
      peer: {
        host: peer,
        port: 0,
        local: false,
        topic
      }
    }

    this._connectedPeers.add(peer)

    this.emit('connection', stream, details)

    stream.once('close', () => {
      if (this.destroyed) {
        return
      }
      this.emit('disconnection', stream, details)
      this._connectedPeers.delete(peer)
    })
  }

  _handleClose () {
    this._protocol = null
    for(let peer of this._connectedPeers) {
      peer.end()
    }
    this.emit('disconnected')
  }

  _handleError (e) {
    this.emit('error', e)
  }

  _handlePeer ({ topic, peer }) {
    const peerData = {
      host: peer,
      port: 0,
      local: false,
      topic
    }

    this.emit('peer', peerData)

    const hasConnected = this._connectedPeers.has(peer)
    const hasMaxPeers = this._connectedPeers.size >= this.maxPeers
    const shouldConnect = this._autoconnect && !hasConnected && !hasMaxPeers

    if (shouldConnect) {
      this.connect(peerData)
    } else if (!this._seenPeers.find(data => data.peer === peer)) {
      // TODO: Do something with this, like connect to them after disconnection
      this._seenPeers.push(peerData)
    }
  }

  _reJoin () {
    for (const topic of this._topics) {
      this.join(topic)
    }
  }

  get connections () {
    if (!this._protocol) return new Set()
    return this._protocol.connections
  }

  join (topic) {
    if (!this._protocol) throw new Error(NOT_CONNECTED)
    this._protocol.join(topic)
    const hasSeen = this._topics.some((other) => other.equals(topic))
    if (!hasSeen) {
      this._topics.push(topic)
    }
  }

  leave (topic) {
    if (!this._protocol) throw new Error(NOT_CONNECTED)
    this._protocol.leave(topic)
    this._topics = this._topics.filter((other) => !other.equals(topic))
    this._seenPeers = this._seenPeers.filter(({ topic: other }) => !other.equals(topic))
  }

  connect (peer, cb = noop) {
    if (!this._protocol) return setTimeout(() => cb(new Error(NOT_CONNECTED)), 0)
    const id = peer.host

    const listenStreams = (stream, details) => {
      const foundId = details.peer.host
      if (foundId !== id) return
      cb(null, stream, details)
      this.removeListener('connection', listenStreams)
    }

    if (cb) {
      this.on('connection', listenStreams)
    }

    this._protocol.connect(id)
  }

  destroy (cb) {
    this.destroyed = true

    this.disconnect()

    this._topics = null
    this._connectedPeers = null
    this._seenPeers = null

    if (cb) process.nextTick(cb)
  }
}

function noop () {}

}).call(this,require('_process'))
},{"./":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hyperswarm-proxy/index.js","_process":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/process/browser.js","events":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/browserify/node_modules/events/events.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hyperswarm-proxy/index.js":[function(require,module,exports){
(function (Buffer){
const Duplex = require('stream').Duplex
const lps = require('length-prefixed-stream')
const { SwarmEvent, EventType } = require('./messages')
const ProxyStream = require('./proxystream')
const pump = require('pump')

module.exports = class HyperswarmProxyStream extends Duplex {
  constructor (stream) {
    super({
      emitClose: true
    })
    this.connections = new Set()

    // There's going to be a lot of listeners
    this.setMaxListeners(256)

    pump(
      stream,
      lps.decode(),
      this,
      lps.encode(),
      stream, (err) => {
        this._closeAllStreams()
      })

    this.on('on_stream_open', this._handleStreamOpen.bind(this))
  }

  ready () {
    this.sendMessage('READY')
  }

  join (topic) {
    this.sendMessage('JOIN', { topic })
  }

  leave (topic) {
    this.sendMessage('LEAVE', { topic })
  }

  onPeer (topic, peer) {
    this.sendMessage('ON_PEER', { topic, peer })
  }

  connect (peer) {
    this.sendMessage('CONNECT', { peer })
  }

  onStreamOpen (topic, peer, stream) {
    this.sendMessage('ON_STREAM_OPEN', { topic, peer, stream })
  }

  onStreamData (stream, data) {
    if (typeof data === 'string') {
      data = Buffer.from(data, 'utf8')
    }
    this.sendMessage('ON_STREAM_DATA', { stream, data })
  }

  onStreamClose (stream) {
    this.sendMessage('ON_STREAM_CLOSE', { stream })
  }

  onStreamError (stream, message, peer) {
    const data = Buffer.from(message, 'utf8')
    this.sendMessage('ON_STREAM_ERROR', { stream, data })
  }

  openStream (topic, peer, stream) {
    const proxy = new ProxyStream(this, stream)

    this._addStream(proxy)

    this.onStreamOpen(topic, peer, stream)

    return proxy
  }

  _closeAllStreams () {
    for (const connection of this.connections) {
      connection.end()
    }
  }

  _addStream (stream) {
    this.connections.add(stream)
    stream.once('close', () => {
      this.connections.delete(stream)
    })
  }

  _handleStreamOpen ({ topic, peer, stream }) {
    const proxy = new ProxyStream(this, stream)

    this._addStream(proxy)

    this.emit('stream', proxy, { topic, peer })
  }

  sendMessage (type, data = {}) {
    this.push(SwarmEvent.encode({
      type: EventType[type],
      ...data
    }))
  }

  _write (chunk, encoding, callback) {
    try {
      const decoded = SwarmEvent.decode(chunk)

      const { type } = decoded

      for (const name of Object.keys(EventType)) {
        if (EventType[name] === type) {
          this.emit(name.toLowerCase(), decoded)
        }
      }
      callback()
    } catch (e) {
      callback(e)
    }
  }

  // NOOP
  _read () {}
}

}).call(this,require("buffer").Buffer)
},{"./messages":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hyperswarm-proxy/messages.js","./proxystream":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hyperswarm-proxy/proxystream.js","buffer":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/buffer/index.js","length-prefixed-stream":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hyperswarm-proxy/node_modules/length-prefixed-stream/index.js","pump":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/pump/index.js","stream":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/stream-browserify/index.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hyperswarm-proxy/messages.js":[function(require,module,exports){
(function (Buffer){
// This file is auto generated by the protocol-buffers compiler

/* eslint-disable quotes */
/* eslint-disable indent */
/* eslint-disable no-redeclare */
/* eslint-disable camelcase */

// Remember to `npm install --save protocol-buffers-encodings`
var encodings = require('protocol-buffers-encodings')
var varint = encodings.varint
var skip = encodings.skip

exports.EventType = {
  READY: 1,
  JOIN: 2,
  LEAVE: 3,
  ON_STREAM_OPEN: 4,
  ON_STREAM_CLOSE: 5,
  ON_STREAM_DATA: 6,
  ON_STREAM_ERROR: 7,
  ON_PEER: 8,
  CONNECT: 9
}

var SwarmEvent = exports.SwarmEvent = {
  buffer: true,
  encodingLength: null,
  encode: null,
  decode: null
}

defineSwarmEvent()

function defineSwarmEvent () {
  var enc = [
    encodings.enum,
    encodings.bytes,
    encodings.string,
    encodings.int32
  ]

  SwarmEvent.encodingLength = encodingLength
  SwarmEvent.encode = encode
  SwarmEvent.decode = decode

  function encodingLength (obj) {
    var length = 0
    if (!defined(obj.type)) throw new Error("type is required")
    var len = enc[0].encodingLength(obj.type)
    length += 1 + len
    if (defined(obj.topic)) {
      var len = enc[1].encodingLength(obj.topic)
      length += 1 + len
    }
    if (defined(obj.data)) {
      var len = enc[1].encodingLength(obj.data)
      length += 1 + len
    }
    if (defined(obj.peer)) {
      var len = enc[2].encodingLength(obj.peer)
      length += 1 + len
    }
    if (defined(obj.stream)) {
      var len = enc[3].encodingLength(obj.stream)
      length += 1 + len
    }
    return length
  }

  function encode (obj, buf, offset) {
    if (!offset) offset = 0
    if (!buf) buf = Buffer.allocUnsafe(encodingLength(obj))
    var oldOffset = offset
    if (!defined(obj.type)) throw new Error("type is required")
    buf[offset++] = 8
    enc[0].encode(obj.type, buf, offset)
    offset += enc[0].encode.bytes
    if (defined(obj.topic)) {
      buf[offset++] = 18
      enc[1].encode(obj.topic, buf, offset)
      offset += enc[1].encode.bytes
    }
    if (defined(obj.data)) {
      buf[offset++] = 26
      enc[1].encode(obj.data, buf, offset)
      offset += enc[1].encode.bytes
    }
    if (defined(obj.peer)) {
      buf[offset++] = 34
      enc[2].encode(obj.peer, buf, offset)
      offset += enc[2].encode.bytes
    }
    if (defined(obj.stream)) {
      buf[offset++] = 40
      enc[3].encode(obj.stream, buf, offset)
      offset += enc[3].encode.bytes
    }
    encode.bytes = offset - oldOffset
    return buf
  }

  function decode (buf, offset, end) {
    if (!offset) offset = 0
    if (!end) end = buf.length
    if (!(end <= buf.length && offset <= buf.length)) throw new Error("Decoded message is not valid")
    var oldOffset = offset
    var obj = {
      type: 1,
      topic: null,
      data: null,
      peer: "",
      stream: 0
    }
    var found0 = false
    while (true) {
      if (end <= offset) {
        if (!found0) throw new Error("Decoded message is not valid")
        decode.bytes = offset - oldOffset
        return obj
      }
      var prefix = varint.decode(buf, offset)
      offset += varint.decode.bytes
      var tag = prefix >> 3
      switch (tag) {
        case 1:
        obj.type = enc[0].decode(buf, offset)
        offset += enc[0].decode.bytes
        found0 = true
        break
        case 2:
        obj.topic = enc[1].decode(buf, offset)
        offset += enc[1].decode.bytes
        break
        case 3:
        obj.data = enc[1].decode(buf, offset)
        offset += enc[1].decode.bytes
        break
        case 4:
        obj.peer = enc[2].decode(buf, offset)
        offset += enc[2].decode.bytes
        break
        case 5:
        obj.stream = enc[3].decode(buf, offset)
        offset += enc[3].decode.bytes
        break
        default:
        offset = skip(prefix & 7, buf, offset)
      }
    }
  }
}

function defined (val) {
  return val !== null && val !== undefined && (typeof val !== 'number' || !isNaN(val))
}

}).call(this,require("buffer").Buffer)
},{"buffer":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/buffer/index.js","protocol-buffers-encodings":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/protocol-buffers-encodings/index.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hyperswarm-proxy/node_modules/length-prefixed-stream/decode.js":[function(require,module,exports){
(function (Buffer){
var varint = require('varint')
var stream = require('readable-stream')
var inherits = require('inherits')

var Decoder = function (opts) {
  if (!(this instanceof Decoder)) return new Decoder(opts)
  stream.Transform.call(this)

  this._destroyed = false
  this._missing = 0
  this._message = null
  this._limit = (opts && opts.limit) || 0
  this._allowEmpty = !!(opts && opts.allowEmpty)
  this._prefix = Buffer.allocUnsafe(this._limit ? varint.encodingLength(this._limit) : 100)
  this._ptr = 0

  if (this._allowEmpty) {
    this._readableState.highWaterMark = 16
    this._readableState.objectMode = true
  }
}

inherits(Decoder, stream.Transform)

Decoder.prototype._push = function (message) {
  this._ptr = 0
  this._missing = 0
  this._message = null
  this.push(message)
}

Decoder.prototype._parseLength = function (data, offset) {
  for (offset; offset < data.length; offset++) {
    if (this._ptr >= this._prefix.length) return this._prefixError(data)
    this._prefix[this._ptr++] = data[offset]
    if (!(data[offset] & 0x80)) {
      this._missing = varint.decode(this._prefix)
      if (this._limit && this._missing > this._limit) return this._prefixError(data)
      if (!this._missing && this._allowEmpty) this._push(Buffer.alloc(0))
      this._ptr = 0
      return offset + 1
    }
  }
  return data.length
}

Decoder.prototype._prefixError = function (data) {
  this.destroy(new Error('Message is larger than max length'))
  return data.length
}

Decoder.prototype._parseMessage = function (data, offset) {
  var free = data.length - offset
  var missing = this._missing

  if (!this._message) {
    if (missing <= free) { // fast track - no copy
      this._push(data.slice(offset, offset + missing))
      return offset + missing
    }
    this._message = Buffer.allocUnsafe(missing)
  }

  // TODO: add opt-in "partial mode" to completely avoid copys
  data.copy(this._message, this._ptr, offset, offset + missing)

  if (missing <= free) {
    this._push(this._message)
    return offset + missing
  }

  this._missing -= free
  this._ptr += free

  return data.length
}

Decoder.prototype._transform = function (data, enc, cb) {
  var offset = 0

  while (!this._destroyed && offset < data.length) {
    if (this._missing) offset = this._parseMessage(data, offset)
    else offset = this._parseLength(data, offset)
  }

  cb()
}

Decoder.prototype.destroy = function (err) {
  if (this._destroyed) return
  this._destroyed = true
  if (err) this.emit('error', err)
  this.emit('close')
}

module.exports = Decoder

}).call(this,require("buffer").Buffer)
},{"buffer":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/buffer/index.js","inherits":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/inherits/inherits_browser.js","readable-stream":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hyperswarm-proxy/node_modules/readable-stream/readable-browser.js","varint":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hyperswarm-proxy/node_modules/varint/index.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hyperswarm-proxy/node_modules/length-prefixed-stream/encode.js":[function(require,module,exports){
(function (Buffer){
var varint = require('varint')
var stream = require('readable-stream')
var inherits = require('inherits')

var pool = Buffer.allocUnsafe(10 * 1024)
var used = 0

var Encoder = function () {
  if (!(this instanceof Encoder)) return new Encoder()
  stream.Transform.call(this)
  this._destroyed = false
}

inherits(Encoder, stream.Transform)

Encoder.prototype._transform = function (data, enc, cb) {
  if (this._destroyed) return cb()

  varint.encode(data.length, pool, used)
  used += varint.encode.bytes

  this.push(pool.slice(used - varint.encode.bytes, used))
  this.push(data)

  if (pool.length - used < 100) {
    pool = Buffer.allocUnsafe(10 * 1024)
    used = 0
  }

  cb()
}

Encoder.prototype.destroy = function (err) {
  if (this._destroyed) return
  this._destroyed = true
  if (err) this.emit('error', err)
  this.emit('close')
}

module.exports = Encoder

}).call(this,require("buffer").Buffer)
},{"buffer":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/buffer/index.js","inherits":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/inherits/inherits_browser.js","readable-stream":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hyperswarm-proxy/node_modules/readable-stream/readable-browser.js","varint":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hyperswarm-proxy/node_modules/varint/index.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hyperswarm-proxy/node_modules/length-prefixed-stream/index.js":[function(require,module,exports){
exports.encode = require('./encode')
exports.decode = require('./decode')

},{"./decode":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hyperswarm-proxy/node_modules/length-prefixed-stream/decode.js","./encode":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hyperswarm-proxy/node_modules/length-prefixed-stream/encode.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hyperswarm-proxy/node_modules/readable-stream/errors-browser.js":[function(require,module,exports){
'use strict';

function _inheritsLoose(subClass, superClass) { subClass.prototype = Object.create(superClass.prototype); subClass.prototype.constructor = subClass; subClass.__proto__ = superClass; }

var codes = {};

function createErrorType(code, message, Base) {
  if (!Base) {
    Base = Error;
  }

  function getMessage(arg1, arg2, arg3) {
    if (typeof message === 'string') {
      return message;
    } else {
      return message(arg1, arg2, arg3);
    }
  }

  var NodeError =
  /*#__PURE__*/
  function (_Base) {
    _inheritsLoose(NodeError, _Base);

    function NodeError(arg1, arg2, arg3) {
      return _Base.call(this, getMessage(arg1, arg2, arg3)) || this;
    }

    return NodeError;
  }(Base);

  NodeError.prototype.name = Base.name;
  NodeError.prototype.code = code;
  codes[code] = NodeError;
} // https://github.com/nodejs/node/blob/v10.8.0/lib/internal/errors.js


function oneOf(expected, thing) {
  if (Array.isArray(expected)) {
    var len = expected.length;
    expected = expected.map(function (i) {
      return String(i);
    });

    if (len > 2) {
      return "one of ".concat(thing, " ").concat(expected.slice(0, len - 1).join(', '), ", or ") + expected[len - 1];
    } else if (len === 2) {
      return "one of ".concat(thing, " ").concat(expected[0], " or ").concat(expected[1]);
    } else {
      return "of ".concat(thing, " ").concat(expected[0]);
    }
  } else {
    return "of ".concat(thing, " ").concat(String(expected));
  }
} // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/startsWith


function startsWith(str, search, pos) {
  return str.substr(!pos || pos < 0 ? 0 : +pos, search.length) === search;
} // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/endsWith


function endsWith(str, search, this_len) {
  if (this_len === undefined || this_len > str.length) {
    this_len = str.length;
  }

  return str.substring(this_len - search.length, this_len) === search;
} // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/includes


function includes(str, search, start) {
  if (typeof start !== 'number') {
    start = 0;
  }

  if (start + search.length > str.length) {
    return false;
  } else {
    return str.indexOf(search, start) !== -1;
  }
}

createErrorType('ERR_INVALID_OPT_VALUE', function (name, value) {
  return 'The value "' + value + '" is invalid for option "' + name + '"';
}, TypeError);
createErrorType('ERR_INVALID_ARG_TYPE', function (name, expected, actual) {
  // determiner: 'must be' or 'must not be'
  var determiner;

  if (typeof expected === 'string' && startsWith(expected, 'not ')) {
    determiner = 'must not be';
    expected = expected.replace(/^not /, '');
  } else {
    determiner = 'must be';
  }

  var msg;

  if (endsWith(name, ' argument')) {
    // For cases like 'first argument'
    msg = "The ".concat(name, " ").concat(determiner, " ").concat(oneOf(expected, 'type'));
  } else {
    var type = includes(name, '.') ? 'property' : 'argument';
    msg = "The \"".concat(name, "\" ").concat(type, " ").concat(determiner, " ").concat(oneOf(expected, 'type'));
  }

  msg += ". Received type ".concat(typeof actual);
  return msg;
}, TypeError);
createErrorType('ERR_STREAM_PUSH_AFTER_EOF', 'stream.push() after EOF');
createErrorType('ERR_METHOD_NOT_IMPLEMENTED', function (name) {
  return 'The ' + name + ' method is not implemented';
});
createErrorType('ERR_STREAM_PREMATURE_CLOSE', 'Premature close');
createErrorType('ERR_STREAM_DESTROYED', function (name) {
  return 'Cannot call ' + name + ' after a stream was destroyed';
});
createErrorType('ERR_MULTIPLE_CALLBACK', 'Callback called multiple times');
createErrorType('ERR_STREAM_CANNOT_PIPE', 'Cannot pipe, not readable');
createErrorType('ERR_STREAM_WRITE_AFTER_END', 'write after end');
createErrorType('ERR_STREAM_NULL_VALUES', 'May not write null values to stream', TypeError);
createErrorType('ERR_UNKNOWN_ENCODING', function (arg) {
  return 'Unknown encoding: ' + arg;
}, TypeError);
createErrorType('ERR_STREAM_UNSHIFT_AFTER_END_EVENT', 'stream.unshift() after end event');
module.exports.codes = codes;

},{}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hyperswarm-proxy/node_modules/readable-stream/experimentalWarning.js":[function(require,module,exports){
(function (process){
'use strict'

var experimentalWarnings = new Set();

function emitExperimentalWarning(feature) {
  if (experimentalWarnings.has(feature)) return;
  var msg = feature + ' is an experimental feature. This feature could ' +
       'change at any time';
  experimentalWarnings.add(feature);
  process.emitWarning(msg, 'ExperimentalWarning');
}

function noop() {}

module.exports.emitExperimentalWarning = process.emitWarning
  ? emitExperimentalWarning
  : noop;

}).call(this,require('_process'))
},{"_process":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/process/browser.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hyperswarm-proxy/node_modules/readable-stream/lib/_stream_duplex.js":[function(require,module,exports){
(function (process){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.
// a duplex stream is just a stream that is both readable and writable.
// Since JS doesn't have multiple prototypal inheritance, this class
// prototypally inherits from Readable, and then parasitically from
// Writable.
'use strict';
/*<replacement>*/

var objectKeys = Object.keys || function (obj) {
  var keys = [];

  for (var key in obj) {
    keys.push(key);
  }

  return keys;
};
/*</replacement>*/


module.exports = Duplex;

var Readable = require('./_stream_readable');

var Writable = require('./_stream_writable');

require('inherits')(Duplex, Readable);

{
  // Allow the keys array to be GC'ed.
  var keys = objectKeys(Writable.prototype);

  for (var v = 0; v < keys.length; v++) {
    var method = keys[v];
    if (!Duplex.prototype[method]) Duplex.prototype[method] = Writable.prototype[method];
  }
}

function Duplex(options) {
  if (!(this instanceof Duplex)) return new Duplex(options);
  Readable.call(this, options);
  Writable.call(this, options);
  this.allowHalfOpen = true;

  if (options) {
    if (options.readable === false) this.readable = false;
    if (options.writable === false) this.writable = false;

    if (options.allowHalfOpen === false) {
      this.allowHalfOpen = false;
      this.once('end', onend);
    }
  }
}

Object.defineProperty(Duplex.prototype, 'writableHighWaterMark', {
  // making it explicit this property is not enumerable
  // because otherwise some prototype manipulation in
  // userland will fail
  enumerable: false,
  get: function get() {
    return this._writableState.highWaterMark;
  }
});
Object.defineProperty(Duplex.prototype, 'writableBuffer', {
  // making it explicit this property is not enumerable
  // because otherwise some prototype manipulation in
  // userland will fail
  enumerable: false,
  get: function get() {
    return this._writableState && this._writableState.getBuffer();
  }
});
Object.defineProperty(Duplex.prototype, 'writableLength', {
  // making it explicit this property is not enumerable
  // because otherwise some prototype manipulation in
  // userland will fail
  enumerable: false,
  get: function get() {
    return this._writableState.length;
  }
}); // the no-half-open enforcer

function onend() {
  // If the writable side ended, then we're ok.
  if (this._writableState.ended) return; // no more data can be written.
  // But allow more writes to happen in this tick.

  process.nextTick(onEndNT, this);
}

function onEndNT(self) {
  self.end();
}

Object.defineProperty(Duplex.prototype, 'destroyed', {
  // making it explicit this property is not enumerable
  // because otherwise some prototype manipulation in
  // userland will fail
  enumerable: false,
  get: function get() {
    if (this._readableState === undefined || this._writableState === undefined) {
      return false;
    }

    return this._readableState.destroyed && this._writableState.destroyed;
  },
  set: function set(value) {
    // we ignore the value if the stream
    // has not been initialized yet
    if (this._readableState === undefined || this._writableState === undefined) {
      return;
    } // backward compatibility, the user is explicitly
    // managing destroyed


    this._readableState.destroyed = value;
    this._writableState.destroyed = value;
  }
});
}).call(this,require('_process'))
},{"./_stream_readable":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hyperswarm-proxy/node_modules/readable-stream/lib/_stream_readable.js","./_stream_writable":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hyperswarm-proxy/node_modules/readable-stream/lib/_stream_writable.js","_process":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/process/browser.js","inherits":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/inherits/inherits_browser.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hyperswarm-proxy/node_modules/readable-stream/lib/_stream_passthrough.js":[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.
// a passthrough stream.
// basically just the most minimal sort of Transform stream.
// Every written chunk gets output as-is.
'use strict';

module.exports = PassThrough;

var Transform = require('./_stream_transform');

require('inherits')(PassThrough, Transform);

function PassThrough(options) {
  if (!(this instanceof PassThrough)) return new PassThrough(options);
  Transform.call(this, options);
}

PassThrough.prototype._transform = function (chunk, encoding, cb) {
  cb(null, chunk);
};
},{"./_stream_transform":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hyperswarm-proxy/node_modules/readable-stream/lib/_stream_transform.js","inherits":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/inherits/inherits_browser.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hyperswarm-proxy/node_modules/readable-stream/lib/_stream_readable.js":[function(require,module,exports){
(function (process,global){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.
'use strict';

module.exports = Readable;
/*<replacement>*/

var Duplex;
/*</replacement>*/

Readable.ReadableState = ReadableState;
/*<replacement>*/

var EE = require('events').EventEmitter;

var EElistenerCount = function EElistenerCount(emitter, type) {
  return emitter.listeners(type).length;
};
/*</replacement>*/

/*<replacement>*/


var Stream = require('./internal/streams/stream');
/*</replacement>*/


var Buffer = require('buffer').Buffer;

var OurUint8Array = global.Uint8Array || function () {};

function _uint8ArrayToBuffer(chunk) {
  return Buffer.from(chunk);
}

function _isUint8Array(obj) {
  return Buffer.isBuffer(obj) || obj instanceof OurUint8Array;
}
/*<replacement>*/


var debugUtil = require('util');

var debug;

if (debugUtil && debugUtil.debuglog) {
  debug = debugUtil.debuglog('stream');
} else {
  debug = function debug() {};
}
/*</replacement>*/


var BufferList = require('./internal/streams/buffer_list');

var destroyImpl = require('./internal/streams/destroy');

var _require = require('./internal/streams/state'),
    getHighWaterMark = _require.getHighWaterMark;

var _require$codes = require('../errors').codes,
    ERR_INVALID_ARG_TYPE = _require$codes.ERR_INVALID_ARG_TYPE,
    ERR_STREAM_PUSH_AFTER_EOF = _require$codes.ERR_STREAM_PUSH_AFTER_EOF,
    ERR_METHOD_NOT_IMPLEMENTED = _require$codes.ERR_METHOD_NOT_IMPLEMENTED,
    ERR_STREAM_UNSHIFT_AFTER_END_EVENT = _require$codes.ERR_STREAM_UNSHIFT_AFTER_END_EVENT;

var _require2 = require('../experimentalWarning'),
    emitExperimentalWarning = _require2.emitExperimentalWarning; // Lazy loaded to improve the startup performance.


var StringDecoder;
var createReadableStreamAsyncIterator;

require('inherits')(Readable, Stream);

var kProxyEvents = ['error', 'close', 'destroy', 'pause', 'resume'];

function prependListener(emitter, event, fn) {
  // Sadly this is not cacheable as some libraries bundle their own
  // event emitter implementation with them.
  if (typeof emitter.prependListener === 'function') return emitter.prependListener(event, fn); // This is a hack to make sure that our error handler is attached before any
  // userland ones.  NEVER DO THIS. This is here only because this code needs
  // to continue to work with older versions of Node.js that do not include
  // the prependListener() method. The goal is to eventually remove this hack.

  if (!emitter._events || !emitter._events[event]) emitter.on(event, fn);else if (Array.isArray(emitter._events[event])) emitter._events[event].unshift(fn);else emitter._events[event] = [fn, emitter._events[event]];
}

function ReadableState(options, stream, isDuplex) {
  Duplex = Duplex || require('./_stream_duplex');
  options = options || {}; // Duplex streams are both readable and writable, but share
  // the same options object.
  // However, some cases require setting options to different
  // values for the readable and the writable sides of the duplex stream.
  // These options can be provided separately as readableXXX and writableXXX.

  if (typeof isDuplex !== 'boolean') isDuplex = stream instanceof Duplex; // object stream flag. Used to make read(n) ignore n and to
  // make all the buffer merging and length checks go away

  this.objectMode = !!options.objectMode;
  if (isDuplex) this.objectMode = this.objectMode || !!options.readableObjectMode; // the point at which it stops calling _read() to fill the buffer
  // Note: 0 is a valid value, means "don't call _read preemptively ever"

  this.highWaterMark = getHighWaterMark(this, options, 'readableHighWaterMark', isDuplex); // A linked list is used to store data chunks instead of an array because the
  // linked list can remove elements from the beginning faster than
  // array.shift()

  this.buffer = new BufferList();
  this.length = 0;
  this.pipes = null;
  this.pipesCount = 0;
  this.flowing = null;
  this.ended = false;
  this.endEmitted = false;
  this.reading = false; // a flag to be able to tell if the event 'readable'/'data' is emitted
  // immediately, or on a later tick.  We set this to true at first, because
  // any actions that shouldn't happen until "later" should generally also
  // not happen before the first read call.

  this.sync = true; // whenever we return null, then we set a flag to say
  // that we're awaiting a 'readable' event emission.

  this.needReadable = false;
  this.emittedReadable = false;
  this.readableListening = false;
  this.resumeScheduled = false;
  this.paused = true; // Should close be emitted on destroy. Defaults to true.

  this.emitClose = options.emitClose !== false; // has it been destroyed

  this.destroyed = false; // Crypto is kind of old and crusty.  Historically, its default string
  // encoding is 'binary' so we have to make this configurable.
  // Everything else in the universe uses 'utf8', though.

  this.defaultEncoding = options.defaultEncoding || 'utf8'; // the number of writers that are awaiting a drain event in .pipe()s

  this.awaitDrain = 0; // if true, a maybeReadMore has been scheduled

  this.readingMore = false;
  this.decoder = null;
  this.encoding = null;

  if (options.encoding) {
    if (!StringDecoder) StringDecoder = require('string_decoder/').StringDecoder;
    this.decoder = new StringDecoder(options.encoding);
    this.encoding = options.encoding;
  }
}

function Readable(options) {
  Duplex = Duplex || require('./_stream_duplex');
  if (!(this instanceof Readable)) return new Readable(options); // Checking for a Stream.Duplex instance is faster here instead of inside
  // the ReadableState constructor, at least with V8 6.5

  var isDuplex = this instanceof Duplex;
  this._readableState = new ReadableState(options, this, isDuplex); // legacy

  this.readable = true;

  if (options) {
    if (typeof options.read === 'function') this._read = options.read;
    if (typeof options.destroy === 'function') this._destroy = options.destroy;
  }

  Stream.call(this);
}

Object.defineProperty(Readable.prototype, 'destroyed', {
  // making it explicit this property is not enumerable
  // because otherwise some prototype manipulation in
  // userland will fail
  enumerable: false,
  get: function get() {
    if (this._readableState === undefined) {
      return false;
    }

    return this._readableState.destroyed;
  },
  set: function set(value) {
    // we ignore the value if the stream
    // has not been initialized yet
    if (!this._readableState) {
      return;
    } // backward compatibility, the user is explicitly
    // managing destroyed


    this._readableState.destroyed = value;
  }
});
Readable.prototype.destroy = destroyImpl.destroy;
Readable.prototype._undestroy = destroyImpl.undestroy;

Readable.prototype._destroy = function (err, cb) {
  cb(err);
}; // Manually shove something into the read() buffer.
// This returns true if the highWaterMark has not been hit yet,
// similar to how Writable.write() returns true if you should
// write() some more.


Readable.prototype.push = function (chunk, encoding) {
  var state = this._readableState;
  var skipChunkCheck;

  if (!state.objectMode) {
    if (typeof chunk === 'string') {
      encoding = encoding || state.defaultEncoding;

      if (encoding !== state.encoding) {
        chunk = Buffer.from(chunk, encoding);
        encoding = '';
      }

      skipChunkCheck = true;
    }
  } else {
    skipChunkCheck = true;
  }

  return readableAddChunk(this, chunk, encoding, false, skipChunkCheck);
}; // Unshift should *always* be something directly out of read()


Readable.prototype.unshift = function (chunk) {
  return readableAddChunk(this, chunk, null, true, false);
};

function readableAddChunk(stream, chunk, encoding, addToFront, skipChunkCheck) {
  debug('readableAddChunk', chunk);
  var state = stream._readableState;

  if (chunk === null) {
    state.reading = false;
    onEofChunk(stream, state);
  } else {
    var er;
    if (!skipChunkCheck) er = chunkInvalid(state, chunk);

    if (er) {
      stream.emit('error', er);
    } else if (state.objectMode || chunk && chunk.length > 0) {
      if (typeof chunk !== 'string' && !state.objectMode && Object.getPrototypeOf(chunk) !== Buffer.prototype) {
        chunk = _uint8ArrayToBuffer(chunk);
      }

      if (addToFront) {
        if (state.endEmitted) stream.emit('error', new ERR_STREAM_UNSHIFT_AFTER_END_EVENT());else addChunk(stream, state, chunk, true);
      } else if (state.ended) {
        stream.emit('error', new ERR_STREAM_PUSH_AFTER_EOF());
      } else if (state.destroyed) {
        return false;
      } else {
        state.reading = false;

        if (state.decoder && !encoding) {
          chunk = state.decoder.write(chunk);
          if (state.objectMode || chunk.length !== 0) addChunk(stream, state, chunk, false);else maybeReadMore(stream, state);
        } else {
          addChunk(stream, state, chunk, false);
        }
      }
    } else if (!addToFront) {
      state.reading = false;
      maybeReadMore(stream, state);
    }
  } // We can push more data if we are below the highWaterMark.
  // Also, if we have no data yet, we can stand some more bytes.
  // This is to work around cases where hwm=0, such as the repl.


  return !state.ended && (state.length < state.highWaterMark || state.length === 0);
}

function addChunk(stream, state, chunk, addToFront) {
  if (state.flowing && state.length === 0 && !state.sync) {
    state.awaitDrain = 0;
    stream.emit('data', chunk);
  } else {
    // update the buffer info.
    state.length += state.objectMode ? 1 : chunk.length;
    if (addToFront) state.buffer.unshift(chunk);else state.buffer.push(chunk);
    if (state.needReadable) emitReadable(stream);
  }

  maybeReadMore(stream, state);
}

function chunkInvalid(state, chunk) {
  var er;

  if (!_isUint8Array(chunk) && typeof chunk !== 'string' && chunk !== undefined && !state.objectMode) {
    er = new ERR_INVALID_ARG_TYPE('chunk', ['string', 'Buffer', 'Uint8Array'], chunk);
  }

  return er;
}

Readable.prototype.isPaused = function () {
  return this._readableState.flowing === false;
}; // backwards compatibility.


Readable.prototype.setEncoding = function (enc) {
  if (!StringDecoder) StringDecoder = require('string_decoder/').StringDecoder;
  this._readableState.decoder = new StringDecoder(enc); // if setEncoding(null), decoder.encoding equals utf8

  this._readableState.encoding = this._readableState.decoder.encoding;
  return this;
}; // Don't raise the hwm > 8MB


var MAX_HWM = 0x800000;

function computeNewHighWaterMark(n) {
  if (n >= MAX_HWM) {
    n = MAX_HWM;
  } else {
    // Get the next highest power of 2 to prevent increasing hwm excessively in
    // tiny amounts
    n--;
    n |= n >>> 1;
    n |= n >>> 2;
    n |= n >>> 4;
    n |= n >>> 8;
    n |= n >>> 16;
    n++;
  }

  return n;
} // This function is designed to be inlinable, so please take care when making
// changes to the function body.


function howMuchToRead(n, state) {
  if (n <= 0 || state.length === 0 && state.ended) return 0;
  if (state.objectMode) return 1;

  if (n !== n) {
    // Only flow one buffer at a time
    if (state.flowing && state.length) return state.buffer.head.data.length;else return state.length;
  } // If we're asking for more than the current hwm, then raise the hwm.


  if (n > state.highWaterMark) state.highWaterMark = computeNewHighWaterMark(n);
  if (n <= state.length) return n; // Don't have enough

  if (!state.ended) {
    state.needReadable = true;
    return 0;
  }

  return state.length;
} // you can override either this method, or the async _read(n) below.


Readable.prototype.read = function (n) {
  debug('read', n);
  n = parseInt(n, 10);
  var state = this._readableState;
  var nOrig = n;
  if (n !== 0) state.emittedReadable = false; // if we're doing read(0) to trigger a readable event, but we
  // already have a bunch of data in the buffer, then just trigger
  // the 'readable' event and move on.

  if (n === 0 && state.needReadable && ((state.highWaterMark !== 0 ? state.length >= state.highWaterMark : state.length > 0) || state.ended)) {
    debug('read: emitReadable', state.length, state.ended);
    if (state.length === 0 && state.ended) endReadable(this);else emitReadable(this);
    return null;
  }

  n = howMuchToRead(n, state); // if we've ended, and we're now clear, then finish it up.

  if (n === 0 && state.ended) {
    if (state.length === 0) endReadable(this);
    return null;
  } // All the actual chunk generation logic needs to be
  // *below* the call to _read.  The reason is that in certain
  // synthetic stream cases, such as passthrough streams, _read
  // may be a completely synchronous operation which may change
  // the state of the read buffer, providing enough data when
  // before there was *not* enough.
  //
  // So, the steps are:
  // 1. Figure out what the state of things will be after we do
  // a read from the buffer.
  //
  // 2. If that resulting state will trigger a _read, then call _read.
  // Note that this may be asynchronous, or synchronous.  Yes, it is
  // deeply ugly to write APIs this way, but that still doesn't mean
  // that the Readable class should behave improperly, as streams are
  // designed to be sync/async agnostic.
  // Take note if the _read call is sync or async (ie, if the read call
  // has returned yet), so that we know whether or not it's safe to emit
  // 'readable' etc.
  //
  // 3. Actually pull the requested chunks out of the buffer and return.
  // if we need a readable event, then we need to do some reading.


  var doRead = state.needReadable;
  debug('need readable', doRead); // if we currently have less than the highWaterMark, then also read some

  if (state.length === 0 || state.length - n < state.highWaterMark) {
    doRead = true;
    debug('length less than watermark', doRead);
  } // however, if we've ended, then there's no point, and if we're already
  // reading, then it's unnecessary.


  if (state.ended || state.reading) {
    doRead = false;
    debug('reading or ended', doRead);
  } else if (doRead) {
    debug('do read');
    state.reading = true;
    state.sync = true; // if the length is currently zero, then we *need* a readable event.

    if (state.length === 0) state.needReadable = true; // call internal read method

    this._read(state.highWaterMark);

    state.sync = false; // If _read pushed data synchronously, then `reading` will be false,
    // and we need to re-evaluate how much data we can return to the user.

    if (!state.reading) n = howMuchToRead(nOrig, state);
  }

  var ret;
  if (n > 0) ret = fromList(n, state);else ret = null;

  if (ret === null) {
    state.needReadable = true;
    n = 0;
  } else {
    state.length -= n;
    state.awaitDrain = 0;
  }

  if (state.length === 0) {
    // If we have nothing in the buffer, then we want to know
    // as soon as we *do* get something into the buffer.
    if (!state.ended) state.needReadable = true; // If we tried to read() past the EOF, then emit end on the next tick.

    if (nOrig !== n && state.ended) endReadable(this);
  }

  if (ret !== null) this.emit('data', ret);
  return ret;
};

function onEofChunk(stream, state) {
  if (state.ended) return;

  if (state.decoder) {
    var chunk = state.decoder.end();

    if (chunk && chunk.length) {
      state.buffer.push(chunk);
      state.length += state.objectMode ? 1 : chunk.length;
    }
  }

  state.ended = true;

  if (state.sync) {
    // if we are sync, wait until next tick to emit the data.
    // Otherwise we risk emitting data in the flow()
    // the readable code triggers during a read() call
    emitReadable(stream);
  } else {
    // emit 'readable' now to make sure it gets picked up.
    state.needReadable = false;

    if (!state.emittedReadable) {
      state.emittedReadable = true;
      emitReadable_(stream);
    }
  }
} // Don't emit readable right away in sync mode, because this can trigger
// another read() call => stack overflow.  This way, it might trigger
// a nextTick recursion warning, but that's not so bad.


function emitReadable(stream) {
  var state = stream._readableState;
  state.needReadable = false;

  if (!state.emittedReadable) {
    debug('emitReadable', state.flowing);
    state.emittedReadable = true;
    process.nextTick(emitReadable_, stream);
  }
}

function emitReadable_(stream) {
  var state = stream._readableState;
  debug('emitReadable_', state.destroyed, state.length, state.ended);

  if (!state.destroyed && (state.length || state.ended)) {
    stream.emit('readable');
  } // The stream needs another readable event if
  // 1. It is not flowing, as the flow mechanism will take
  //    care of it.
  // 2. It is not ended.
  // 3. It is below the highWaterMark, so we can schedule
  //    another readable later.


  state.needReadable = !state.flowing && !state.ended && state.length <= state.highWaterMark;
  flow(stream);
} // at this point, the user has presumably seen the 'readable' event,
// and called read() to consume some data.  that may have triggered
// in turn another _read(n) call, in which case reading = true if
// it's in progress.
// However, if we're not ended, or reading, and the length < hwm,
// then go ahead and try to read some more preemptively.


function maybeReadMore(stream, state) {
  if (!state.readingMore) {
    state.readingMore = true;
    process.nextTick(maybeReadMore_, stream, state);
  }
}

function maybeReadMore_(stream, state) {
  // Attempt to read more data if we should.
  //
  // The conditions for reading more data are (one of):
  // - Not enough data buffered (state.length < state.highWaterMark). The loop
  //   is responsible for filling the buffer with enough data if such data
  //   is available. If highWaterMark is 0 and we are not in the flowing mode
  //   we should _not_ attempt to buffer any extra data. We'll get more data
  //   when the stream consumer calls read() instead.
  // - No data in the buffer, and the stream is in flowing mode. In this mode
  //   the loop below is responsible for ensuring read() is called. Failing to
  //   call read here would abort the flow and there's no other mechanism for
  //   continuing the flow if the stream consumer has just subscribed to the
  //   'data' event.
  //
  // In addition to the above conditions to keep reading data, the following
  // conditions prevent the data from being read:
  // - The stream has ended (state.ended).
  // - There is already a pending 'read' operation (state.reading). This is a
  //   case where the the stream has called the implementation defined _read()
  //   method, but they are processing the call asynchronously and have _not_
  //   called push() with new data. In this case we skip performing more
  //   read()s. The execution ends in this method again after the _read() ends
  //   up calling push() with more data.
  while (!state.reading && !state.ended && (state.length < state.highWaterMark || state.flowing && state.length === 0)) {
    var len = state.length;
    debug('maybeReadMore read 0');
    stream.read(0);
    if (len === state.length) // didn't get any data, stop spinning.
      break;
  }

  state.readingMore = false;
} // abstract method.  to be overridden in specific implementation classes.
// call cb(er, data) where data is <= n in length.
// for virtual (non-string, non-buffer) streams, "length" is somewhat
// arbitrary, and perhaps not very meaningful.


Readable.prototype._read = function (n) {
  this.emit('error', new ERR_METHOD_NOT_IMPLEMENTED('_read()'));
};

Readable.prototype.pipe = function (dest, pipeOpts) {
  var src = this;
  var state = this._readableState;

  switch (state.pipesCount) {
    case 0:
      state.pipes = dest;
      break;

    case 1:
      state.pipes = [state.pipes, dest];
      break;

    default:
      state.pipes.push(dest);
      break;
  }

  state.pipesCount += 1;
  debug('pipe count=%d opts=%j', state.pipesCount, pipeOpts);
  var doEnd = (!pipeOpts || pipeOpts.end !== false) && dest !== process.stdout && dest !== process.stderr;
  var endFn = doEnd ? onend : unpipe;
  if (state.endEmitted) process.nextTick(endFn);else src.once('end', endFn);
  dest.on('unpipe', onunpipe);

  function onunpipe(readable, unpipeInfo) {
    debug('onunpipe');

    if (readable === src) {
      if (unpipeInfo && unpipeInfo.hasUnpiped === false) {
        unpipeInfo.hasUnpiped = true;
        cleanup();
      }
    }
  }

  function onend() {
    debug('onend');
    dest.end();
  } // when the dest drains, it reduces the awaitDrain counter
  // on the source.  This would be more elegant with a .once()
  // handler in flow(), but adding and removing repeatedly is
  // too slow.


  var ondrain = pipeOnDrain(src);
  dest.on('drain', ondrain);
  var cleanedUp = false;

  function cleanup() {
    debug('cleanup'); // cleanup event handlers once the pipe is broken

    dest.removeListener('close', onclose);
    dest.removeListener('finish', onfinish);
    dest.removeListener('drain', ondrain);
    dest.removeListener('error', onerror);
    dest.removeListener('unpipe', onunpipe);
    src.removeListener('end', onend);
    src.removeListener('end', unpipe);
    src.removeListener('data', ondata);
    cleanedUp = true; // if the reader is waiting for a drain event from this
    // specific writer, then it would cause it to never start
    // flowing again.
    // So, if this is awaiting a drain, then we just call it now.
    // If we don't know, then assume that we are waiting for one.

    if (state.awaitDrain && (!dest._writableState || dest._writableState.needDrain)) ondrain();
  }

  src.on('data', ondata);

  function ondata(chunk) {
    debug('ondata');
    var ret = dest.write(chunk);
    debug('dest.write', ret);

    if (ret === false) {
      // If the user unpiped during `dest.write()`, it is possible
      // to get stuck in a permanently paused state if that write
      // also returned false.
      // => Check whether `dest` is still a piping destination.
      if ((state.pipesCount === 1 && state.pipes === dest || state.pipesCount > 1 && indexOf(state.pipes, dest) !== -1) && !cleanedUp) {
        debug('false write response, pause', state.awaitDrain);
        state.awaitDrain++;
      }

      src.pause();
    }
  } // if the dest has an error, then stop piping into it.
  // however, don't suppress the throwing behavior for this.


  function onerror(er) {
    debug('onerror', er);
    unpipe();
    dest.removeListener('error', onerror);
    if (EElistenerCount(dest, 'error') === 0) dest.emit('error', er);
  } // Make sure our error handler is attached before userland ones.


  prependListener(dest, 'error', onerror); // Both close and finish should trigger unpipe, but only once.

  function onclose() {
    dest.removeListener('finish', onfinish);
    unpipe();
  }

  dest.once('close', onclose);

  function onfinish() {
    debug('onfinish');
    dest.removeListener('close', onclose);
    unpipe();
  }

  dest.once('finish', onfinish);

  function unpipe() {
    debug('unpipe');
    src.unpipe(dest);
  } // tell the dest that it's being piped to


  dest.emit('pipe', src); // start the flow if it hasn't been started already.

  if (!state.flowing) {
    debug('pipe resume');
    src.resume();
  }

  return dest;
};

function pipeOnDrain(src) {
  return function pipeOnDrainFunctionResult() {
    var state = src._readableState;
    debug('pipeOnDrain', state.awaitDrain);
    if (state.awaitDrain) state.awaitDrain--;

    if (state.awaitDrain === 0 && EElistenerCount(src, 'data')) {
      state.flowing = true;
      flow(src);
    }
  };
}

Readable.prototype.unpipe = function (dest) {
  var state = this._readableState;
  var unpipeInfo = {
    hasUnpiped: false
  }; // if we're not piping anywhere, then do nothing.

  if (state.pipesCount === 0) return this; // just one destination.  most common case.

  if (state.pipesCount === 1) {
    // passed in one, but it's not the right one.
    if (dest && dest !== state.pipes) return this;
    if (!dest) dest = state.pipes; // got a match.

    state.pipes = null;
    state.pipesCount = 0;
    state.flowing = false;
    if (dest) dest.emit('unpipe', this, unpipeInfo);
    return this;
  } // slow case. multiple pipe destinations.


  if (!dest) {
    // remove all.
    var dests = state.pipes;
    var len = state.pipesCount;
    state.pipes = null;
    state.pipesCount = 0;
    state.flowing = false;

    for (var i = 0; i < len; i++) {
      dests[i].emit('unpipe', this, {
        hasUnpiped: false
      });
    }

    return this;
  } // try to find the right one.


  var index = indexOf(state.pipes, dest);
  if (index === -1) return this;
  state.pipes.splice(index, 1);
  state.pipesCount -= 1;
  if (state.pipesCount === 1) state.pipes = state.pipes[0];
  dest.emit('unpipe', this, unpipeInfo);
  return this;
}; // set up data events if they are asked for
// Ensure readable listeners eventually get something


Readable.prototype.on = function (ev, fn) {
  var res = Stream.prototype.on.call(this, ev, fn);
  var state = this._readableState;

  if (ev === 'data') {
    // update readableListening so that resume() may be a no-op
    // a few lines down. This is needed to support once('readable').
    state.readableListening = this.listenerCount('readable') > 0; // Try start flowing on next tick if stream isn't explicitly paused

    if (state.flowing !== false) this.resume();
  } else if (ev === 'readable') {
    if (!state.endEmitted && !state.readableListening) {
      state.readableListening = state.needReadable = true;
      state.flowing = false;
      state.emittedReadable = false;
      debug('on readable', state.length, state.reading);

      if (state.length) {
        emitReadable(this);
      } else if (!state.reading) {
        process.nextTick(nReadingNextTick, this);
      }
    }
  }

  return res;
};

Readable.prototype.addListener = Readable.prototype.on;

Readable.prototype.removeListener = function (ev, fn) {
  var res = Stream.prototype.removeListener.call(this, ev, fn);

  if (ev === 'readable') {
    // We need to check if there is someone still listening to
    // readable and reset the state. However this needs to happen
    // after readable has been emitted but before I/O (nextTick) to
    // support once('readable', fn) cycles. This means that calling
    // resume within the same tick will have no
    // effect.
    process.nextTick(updateReadableListening, this);
  }

  return res;
};

Readable.prototype.removeAllListeners = function (ev) {
  var res = Stream.prototype.removeAllListeners.apply(this, arguments);

  if (ev === 'readable' || ev === undefined) {
    // We need to check if there is someone still listening to
    // readable and reset the state. However this needs to happen
    // after readable has been emitted but before I/O (nextTick) to
    // support once('readable', fn) cycles. This means that calling
    // resume within the same tick will have no
    // effect.
    process.nextTick(updateReadableListening, this);
  }

  return res;
};

function updateReadableListening(self) {
  var state = self._readableState;
  state.readableListening = self.listenerCount('readable') > 0;

  if (state.resumeScheduled && !state.paused) {
    // flowing needs to be set to true now, otherwise
    // the upcoming resume will not flow.
    state.flowing = true; // crude way to check if we should resume
  } else if (self.listenerCount('data') > 0) {
    self.resume();
  }
}

function nReadingNextTick(self) {
  debug('readable nexttick read 0');
  self.read(0);
} // pause() and resume() are remnants of the legacy readable stream API
// If the user uses them, then switch into old mode.


Readable.prototype.resume = function () {
  var state = this._readableState;

  if (!state.flowing) {
    debug('resume'); // we flow only if there is no one listening
    // for readable, but we still have to call
    // resume()

    state.flowing = !state.readableListening;
    resume(this, state);
  }

  state.paused = false;
  return this;
};

function resume(stream, state) {
  if (!state.resumeScheduled) {
    state.resumeScheduled = true;
    process.nextTick(resume_, stream, state);
  }
}

function resume_(stream, state) {
  debug('resume', state.reading);

  if (!state.reading) {
    stream.read(0);
  }

  state.resumeScheduled = false;
  stream.emit('resume');
  flow(stream);
  if (state.flowing && !state.reading) stream.read(0);
}

Readable.prototype.pause = function () {
  debug('call pause flowing=%j', this._readableState.flowing);

  if (this._readableState.flowing !== false) {
    debug('pause');
    this._readableState.flowing = false;
    this.emit('pause');
  }

  this._readableState.paused = true;
  return this;
};

function flow(stream) {
  var state = stream._readableState;
  debug('flow', state.flowing);

  while (state.flowing && stream.read() !== null) {
    ;
  }
} // wrap an old-style stream as the async data source.
// This is *not* part of the readable stream interface.
// It is an ugly unfortunate mess of history.


Readable.prototype.wrap = function (stream) {
  var _this = this;

  var state = this._readableState;
  var paused = false;
  stream.on('end', function () {
    debug('wrapped end');

    if (state.decoder && !state.ended) {
      var chunk = state.decoder.end();
      if (chunk && chunk.length) _this.push(chunk);
    }

    _this.push(null);
  });
  stream.on('data', function (chunk) {
    debug('wrapped data');
    if (state.decoder) chunk = state.decoder.write(chunk); // don't skip over falsy values in objectMode

    if (state.objectMode && (chunk === null || chunk === undefined)) return;else if (!state.objectMode && (!chunk || !chunk.length)) return;

    var ret = _this.push(chunk);

    if (!ret) {
      paused = true;
      stream.pause();
    }
  }); // proxy all the other methods.
  // important when wrapping filters and duplexes.

  for (var i in stream) {
    if (this[i] === undefined && typeof stream[i] === 'function') {
      this[i] = function methodWrap(method) {
        return function methodWrapReturnFunction() {
          return stream[method].apply(stream, arguments);
        };
      }(i);
    }
  } // proxy certain important events.


  for (var n = 0; n < kProxyEvents.length; n++) {
    stream.on(kProxyEvents[n], this.emit.bind(this, kProxyEvents[n]));
  } // when we try to consume some more bytes, simply unpause the
  // underlying stream.


  this._read = function (n) {
    debug('wrapped _read', n);

    if (paused) {
      paused = false;
      stream.resume();
    }
  };

  return this;
};

if (typeof Symbol === 'function') {
  Readable.prototype[Symbol.asyncIterator] = function () {
    emitExperimentalWarning('Readable[Symbol.asyncIterator]');

    if (createReadableStreamAsyncIterator === undefined) {
      createReadableStreamAsyncIterator = require('./internal/streams/async_iterator');
    }

    return createReadableStreamAsyncIterator(this);
  };
}

Object.defineProperty(Readable.prototype, 'readableHighWaterMark', {
  // making it explicit this property is not enumerable
  // because otherwise some prototype manipulation in
  // userland will fail
  enumerable: false,
  get: function get() {
    return this._readableState.highWaterMark;
  }
});
Object.defineProperty(Readable.prototype, 'readableBuffer', {
  // making it explicit this property is not enumerable
  // because otherwise some prototype manipulation in
  // userland will fail
  enumerable: false,
  get: function get() {
    return this._readableState && this._readableState.buffer;
  }
});
Object.defineProperty(Readable.prototype, 'readableFlowing', {
  // making it explicit this property is not enumerable
  // because otherwise some prototype manipulation in
  // userland will fail
  enumerable: false,
  get: function get() {
    return this._readableState.flowing;
  },
  set: function set(state) {
    if (this._readableState) {
      this._readableState.flowing = state;
    }
  }
}); // exposed for testing purposes only.

Readable._fromList = fromList;
Object.defineProperty(Readable.prototype, 'readableLength', {
  // making it explicit this property is not enumerable
  // because otherwise some prototype manipulation in
  // userland will fail
  enumerable: false,
  get: function get() {
    return this._readableState.length;
  }
}); // Pluck off n bytes from an array of buffers.
// Length is the combined lengths of all the buffers in the list.
// This function is designed to be inlinable, so please take care when making
// changes to the function body.

function fromList(n, state) {
  // nothing buffered
  if (state.length === 0) return null;
  var ret;
  if (state.objectMode) ret = state.buffer.shift();else if (!n || n >= state.length) {
    // read it all, truncate the list
    if (state.decoder) ret = state.buffer.join('');else if (state.buffer.length === 1) ret = state.buffer.first();else ret = state.buffer.concat(state.length);
    state.buffer.clear();
  } else {
    // read part of list
    ret = state.buffer.consume(n, state.decoder);
  }
  return ret;
}

function endReadable(stream) {
  var state = stream._readableState;
  debug('endReadable', state.endEmitted);

  if (!state.endEmitted) {
    state.ended = true;
    process.nextTick(endReadableNT, state, stream);
  }
}

function endReadableNT(state, stream) {
  debug('endReadableNT', state.endEmitted, state.length); // Check that we didn't get one last unshift.

  if (!state.endEmitted && state.length === 0) {
    state.endEmitted = true;
    stream.readable = false;
    stream.emit('end');
  }
}

function indexOf(xs, x) {
  for (var i = 0, l = xs.length; i < l; i++) {
    if (xs[i] === x) return i;
  }

  return -1;
}
}).call(this,require('_process'),typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"../errors":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hyperswarm-proxy/node_modules/readable-stream/errors-browser.js","../experimentalWarning":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hyperswarm-proxy/node_modules/readable-stream/experimentalWarning.js","./_stream_duplex":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hyperswarm-proxy/node_modules/readable-stream/lib/_stream_duplex.js","./internal/streams/async_iterator":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hyperswarm-proxy/node_modules/readable-stream/lib/internal/streams/async_iterator.js","./internal/streams/buffer_list":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hyperswarm-proxy/node_modules/readable-stream/lib/internal/streams/buffer_list.js","./internal/streams/destroy":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hyperswarm-proxy/node_modules/readable-stream/lib/internal/streams/destroy.js","./internal/streams/state":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hyperswarm-proxy/node_modules/readable-stream/lib/internal/streams/state.js","./internal/streams/stream":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hyperswarm-proxy/node_modules/readable-stream/lib/internal/streams/stream-browser.js","_process":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/process/browser.js","buffer":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/buffer/index.js","events":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/browserify/node_modules/events/events.js","inherits":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/inherits/inherits_browser.js","string_decoder/":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/string_decoder/lib/string_decoder.js","util":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/browser-resolve/empty.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hyperswarm-proxy/node_modules/readable-stream/lib/_stream_transform.js":[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.
// a transform stream is a readable/writable stream where you do
// something with the data.  Sometimes it's called a "filter",
// but that's not a great name for it, since that implies a thing where
// some bits pass through, and others are simply ignored.  (That would
// be a valid example of a transform, of course.)
//
// While the output is causally related to the input, it's not a
// necessarily symmetric or synchronous transformation.  For example,
// a zlib stream might take multiple plain-text writes(), and then
// emit a single compressed chunk some time in the future.
//
// Here's how this works:
//
// The Transform stream has all the aspects of the readable and writable
// stream classes.  When you write(chunk), that calls _write(chunk,cb)
// internally, and returns false if there's a lot of pending writes
// buffered up.  When you call read(), that calls _read(n) until
// there's enough pending readable data buffered up.
//
// In a transform stream, the written data is placed in a buffer.  When
// _read(n) is called, it transforms the queued up data, calling the
// buffered _write cb's as it consumes chunks.  If consuming a single
// written chunk would result in multiple output chunks, then the first
// outputted bit calls the readcb, and subsequent chunks just go into
// the read buffer, and will cause it to emit 'readable' if necessary.
//
// This way, back-pressure is actually determined by the reading side,
// since _read has to be called to start processing a new chunk.  However,
// a pathological inflate type of transform can cause excessive buffering
// here.  For example, imagine a stream where every byte of input is
// interpreted as an integer from 0-255, and then results in that many
// bytes of output.  Writing the 4 bytes {ff,ff,ff,ff} would result in
// 1kb of data being output.  In this case, you could write a very small
// amount of input, and end up with a very large amount of output.  In
// such a pathological inflating mechanism, there'd be no way to tell
// the system to stop doing the transform.  A single 4MB write could
// cause the system to run out of memory.
//
// However, even in such a pathological case, only a single written chunk
// would be consumed, and then the rest would wait (un-transformed) until
// the results of the previous transformed chunk were consumed.
'use strict';

module.exports = Transform;

var _require$codes = require('../errors').codes,
    ERR_METHOD_NOT_IMPLEMENTED = _require$codes.ERR_METHOD_NOT_IMPLEMENTED,
    ERR_MULTIPLE_CALLBACK = _require$codes.ERR_MULTIPLE_CALLBACK,
    ERR_TRANSFORM_ALREADY_TRANSFORMING = _require$codes.ERR_TRANSFORM_ALREADY_TRANSFORMING,
    ERR_TRANSFORM_WITH_LENGTH_0 = _require$codes.ERR_TRANSFORM_WITH_LENGTH_0;

var Duplex = require('./_stream_duplex');

require('inherits')(Transform, Duplex);

function afterTransform(er, data) {
  var ts = this._transformState;
  ts.transforming = false;
  var cb = ts.writecb;

  if (cb === null) {
    return this.emit('error', new ERR_MULTIPLE_CALLBACK());
  }

  ts.writechunk = null;
  ts.writecb = null;
  if (data != null) // single equals check for both `null` and `undefined`
    this.push(data);
  cb(er);
  var rs = this._readableState;
  rs.reading = false;

  if (rs.needReadable || rs.length < rs.highWaterMark) {
    this._read(rs.highWaterMark);
  }
}

function Transform(options) {
  if (!(this instanceof Transform)) return new Transform(options);
  Duplex.call(this, options);
  this._transformState = {
    afterTransform: afterTransform.bind(this),
    needTransform: false,
    transforming: false,
    writecb: null,
    writechunk: null,
    writeencoding: null
  }; // start out asking for a readable event once data is transformed.

  this._readableState.needReadable = true; // we have implemented the _read method, and done the other things
  // that Readable wants before the first _read call, so unset the
  // sync guard flag.

  this._readableState.sync = false;

  if (options) {
    if (typeof options.transform === 'function') this._transform = options.transform;
    if (typeof options.flush === 'function') this._flush = options.flush;
  } // When the writable side finishes, then flush out anything remaining.


  this.on('prefinish', prefinish);
}

function prefinish() {
  var _this = this;

  if (typeof this._flush === 'function' && !this._readableState.destroyed) {
    this._flush(function (er, data) {
      done(_this, er, data);
    });
  } else {
    done(this, null, null);
  }
}

Transform.prototype.push = function (chunk, encoding) {
  this._transformState.needTransform = false;
  return Duplex.prototype.push.call(this, chunk, encoding);
}; // This is the part where you do stuff!
// override this function in implementation classes.
// 'chunk' is an input chunk.
//
// Call `push(newChunk)` to pass along transformed output
// to the readable side.  You may call 'push' zero or more times.
//
// Call `cb(err)` when you are done with this chunk.  If you pass
// an error, then that'll put the hurt on the whole operation.  If you
// never call cb(), then you'll never get another chunk.


Transform.prototype._transform = function (chunk, encoding, cb) {
  cb(new ERR_METHOD_NOT_IMPLEMENTED('_transform()'));
};

Transform.prototype._write = function (chunk, encoding, cb) {
  var ts = this._transformState;
  ts.writecb = cb;
  ts.writechunk = chunk;
  ts.writeencoding = encoding;

  if (!ts.transforming) {
    var rs = this._readableState;
    if (ts.needTransform || rs.needReadable || rs.length < rs.highWaterMark) this._read(rs.highWaterMark);
  }
}; // Doesn't matter what the args are here.
// _transform does all the work.
// That we got here means that the readable side wants more data.


Transform.prototype._read = function (n) {
  var ts = this._transformState;

  if (ts.writechunk !== null && !ts.transforming) {
    ts.transforming = true;

    this._transform(ts.writechunk, ts.writeencoding, ts.afterTransform);
  } else {
    // mark that we need a transform, so that any data that comes in
    // will get processed, now that we've asked for it.
    ts.needTransform = true;
  }
};

Transform.prototype._destroy = function (err, cb) {
  Duplex.prototype._destroy.call(this, err, function (err2) {
    cb(err2);
  });
};

function done(stream, er, data) {
  if (er) return stream.emit('error', er);
  if (data != null) // single equals check for both `null` and `undefined`
    stream.push(data); // TODO(BridgeAR): Write a test for these two error cases
  // if there's nothing in the write buffer, then that means
  // that nothing more will ever be provided

  if (stream._writableState.length) throw new ERR_TRANSFORM_WITH_LENGTH_0();
  if (stream._transformState.transforming) throw new ERR_TRANSFORM_ALREADY_TRANSFORMING();
  return stream.push(null);
}
},{"../errors":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hyperswarm-proxy/node_modules/readable-stream/errors-browser.js","./_stream_duplex":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hyperswarm-proxy/node_modules/readable-stream/lib/_stream_duplex.js","inherits":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/inherits/inherits_browser.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hyperswarm-proxy/node_modules/readable-stream/lib/_stream_writable.js":[function(require,module,exports){
(function (process,global){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.
// A bit simpler than readable streams.
// Implement an async ._write(chunk, encoding, cb), and it'll handle all
// the drain event emission and buffering.
'use strict';

module.exports = Writable;
/* <replacement> */

function WriteReq(chunk, encoding, cb) {
  this.chunk = chunk;
  this.encoding = encoding;
  this.callback = cb;
  this.next = null;
} // It seems a linked list but it is not
// there will be only 2 of these for each stream


function CorkedRequest(state) {
  var _this = this;

  this.next = null;
  this.entry = null;

  this.finish = function () {
    onCorkedFinish(_this, state);
  };
}
/* </replacement> */

/*<replacement>*/


var Duplex;
/*</replacement>*/

Writable.WritableState = WritableState;
/*<replacement>*/

var internalUtil = {
  deprecate: require('util-deprecate')
};
/*</replacement>*/

/*<replacement>*/

var Stream = require('./internal/streams/stream');
/*</replacement>*/


var Buffer = require('buffer').Buffer;

var OurUint8Array = global.Uint8Array || function () {};

function _uint8ArrayToBuffer(chunk) {
  return Buffer.from(chunk);
}

function _isUint8Array(obj) {
  return Buffer.isBuffer(obj) || obj instanceof OurUint8Array;
}

var destroyImpl = require('./internal/streams/destroy');

var _require = require('./internal/streams/state'),
    getHighWaterMark = _require.getHighWaterMark;

var _require$codes = require('../errors').codes,
    ERR_INVALID_ARG_TYPE = _require$codes.ERR_INVALID_ARG_TYPE,
    ERR_METHOD_NOT_IMPLEMENTED = _require$codes.ERR_METHOD_NOT_IMPLEMENTED,
    ERR_MULTIPLE_CALLBACK = _require$codes.ERR_MULTIPLE_CALLBACK,
    ERR_STREAM_CANNOT_PIPE = _require$codes.ERR_STREAM_CANNOT_PIPE,
    ERR_STREAM_DESTROYED = _require$codes.ERR_STREAM_DESTROYED,
    ERR_STREAM_NULL_VALUES = _require$codes.ERR_STREAM_NULL_VALUES,
    ERR_STREAM_WRITE_AFTER_END = _require$codes.ERR_STREAM_WRITE_AFTER_END,
    ERR_UNKNOWN_ENCODING = _require$codes.ERR_UNKNOWN_ENCODING;

require('inherits')(Writable, Stream);

function nop() {}

function WritableState(options, stream, isDuplex) {
  Duplex = Duplex || require('./_stream_duplex');
  options = options || {}; // Duplex streams are both readable and writable, but share
  // the same options object.
  // However, some cases require setting options to different
  // values for the readable and the writable sides of the duplex stream,
  // e.g. options.readableObjectMode vs. options.writableObjectMode, etc.

  if (typeof isDuplex !== 'boolean') isDuplex = stream instanceof Duplex; // object stream flag to indicate whether or not this stream
  // contains buffers or objects.

  this.objectMode = !!options.objectMode;
  if (isDuplex) this.objectMode = this.objectMode || !!options.writableObjectMode; // the point at which write() starts returning false
  // Note: 0 is a valid value, means that we always return false if
  // the entire buffer is not flushed immediately on write()

  this.highWaterMark = getHighWaterMark(this, options, 'writableHighWaterMark', isDuplex); // if _final has been called

  this.finalCalled = false; // drain event flag.

  this.needDrain = false; // at the start of calling end()

  this.ending = false; // when end() has been called, and returned

  this.ended = false; // when 'finish' is emitted

  this.finished = false; // has it been destroyed

  this.destroyed = false; // should we decode strings into buffers before passing to _write?
  // this is here so that some node-core streams can optimize string
  // handling at a lower level.

  var noDecode = options.decodeStrings === false;
  this.decodeStrings = !noDecode; // Crypto is kind of old and crusty.  Historically, its default string
  // encoding is 'binary' so we have to make this configurable.
  // Everything else in the universe uses 'utf8', though.

  this.defaultEncoding = options.defaultEncoding || 'utf8'; // not an actual buffer we keep track of, but a measurement
  // of how much we're waiting to get pushed to some underlying
  // socket or file.

  this.length = 0; // a flag to see when we're in the middle of a write.

  this.writing = false; // when true all writes will be buffered until .uncork() call

  this.corked = 0; // a flag to be able to tell if the onwrite cb is called immediately,
  // or on a later tick.  We set this to true at first, because any
  // actions that shouldn't happen until "later" should generally also
  // not happen before the first write call.

  this.sync = true; // a flag to know if we're processing previously buffered items, which
  // may call the _write() callback in the same tick, so that we don't
  // end up in an overlapped onwrite situation.

  this.bufferProcessing = false; // the callback that's passed to _write(chunk,cb)

  this.onwrite = function (er) {
    onwrite(stream, er);
  }; // the callback that the user supplies to write(chunk,encoding,cb)


  this.writecb = null; // the amount that is being written when _write is called.

  this.writelen = 0;
  this.bufferedRequest = null;
  this.lastBufferedRequest = null; // number of pending user-supplied write callbacks
  // this must be 0 before 'finish' can be emitted

  this.pendingcb = 0; // emit prefinish if the only thing we're waiting for is _write cbs
  // This is relevant for synchronous Transform streams

  this.prefinished = false; // True if the error was already emitted and should not be thrown again

  this.errorEmitted = false; // Should close be emitted on destroy. Defaults to true.

  this.emitClose = options.emitClose !== false; // count buffered requests

  this.bufferedRequestCount = 0; // allocate the first CorkedRequest, there is always
  // one allocated and free to use, and we maintain at most two

  this.corkedRequestsFree = new CorkedRequest(this);
}

WritableState.prototype.getBuffer = function getBuffer() {
  var current = this.bufferedRequest;
  var out = [];

  while (current) {
    out.push(current);
    current = current.next;
  }

  return out;
};

(function () {
  try {
    Object.defineProperty(WritableState.prototype, 'buffer', {
      get: internalUtil.deprecate(function writableStateBufferGetter() {
        return this.getBuffer();
      }, '_writableState.buffer is deprecated. Use _writableState.getBuffer ' + 'instead.', 'DEP0003')
    });
  } catch (_) {}
})(); // Test _writableState for inheritance to account for Duplex streams,
// whose prototype chain only points to Readable.


var realHasInstance;

if (typeof Symbol === 'function' && Symbol.hasInstance && typeof Function.prototype[Symbol.hasInstance] === 'function') {
  realHasInstance = Function.prototype[Symbol.hasInstance];
  Object.defineProperty(Writable, Symbol.hasInstance, {
    value: function value(object) {
      if (realHasInstance.call(this, object)) return true;
      if (this !== Writable) return false;
      return object && object._writableState instanceof WritableState;
    }
  });
} else {
  realHasInstance = function realHasInstance(object) {
    return object instanceof this;
  };
}

function Writable(options) {
  Duplex = Duplex || require('./_stream_duplex'); // Writable ctor is applied to Duplexes, too.
  // `realHasInstance` is necessary because using plain `instanceof`
  // would return false, as no `_writableState` property is attached.
  // Trying to use the custom `instanceof` for Writable here will also break the
  // Node.js LazyTransform implementation, which has a non-trivial getter for
  // `_writableState` that would lead to infinite recursion.
  // Checking for a Stream.Duplex instance is faster here instead of inside
  // the WritableState constructor, at least with V8 6.5

  var isDuplex = this instanceof Duplex;
  if (!isDuplex && !realHasInstance.call(Writable, this)) return new Writable(options);
  this._writableState = new WritableState(options, this, isDuplex); // legacy.

  this.writable = true;

  if (options) {
    if (typeof options.write === 'function') this._write = options.write;
    if (typeof options.writev === 'function') this._writev = options.writev;
    if (typeof options.destroy === 'function') this._destroy = options.destroy;
    if (typeof options.final === 'function') this._final = options.final;
  }

  Stream.call(this);
} // Otherwise people can pipe Writable streams, which is just wrong.


Writable.prototype.pipe = function () {
  this.emit('error', new ERR_STREAM_CANNOT_PIPE());
};

function writeAfterEnd(stream, cb) {
  var er = new ERR_STREAM_WRITE_AFTER_END(); // TODO: defer error events consistently everywhere, not just the cb

  stream.emit('error', er);
  process.nextTick(cb, er);
} // Checks that a user-supplied chunk is valid, especially for the particular
// mode the stream is in. Currently this means that `null` is never accepted
// and undefined/non-string values are only allowed in object mode.


function validChunk(stream, state, chunk, cb) {
  var er;

  if (chunk === null) {
    er = new ERR_STREAM_NULL_VALUES();
  } else if (typeof chunk !== 'string' && !state.objectMode) {
    er = new ERR_INVALID_ARG_TYPE('chunk', ['string', 'Buffer'], chunk);
  }

  if (er) {
    stream.emit('error', er);
    process.nextTick(cb, er);
    return false;
  }

  return true;
}

Writable.prototype.write = function (chunk, encoding, cb) {
  var state = this._writableState;
  var ret = false;

  var isBuf = !state.objectMode && _isUint8Array(chunk);

  if (isBuf && !Buffer.isBuffer(chunk)) {
    chunk = _uint8ArrayToBuffer(chunk);
  }

  if (typeof encoding === 'function') {
    cb = encoding;
    encoding = null;
  }

  if (isBuf) encoding = 'buffer';else if (!encoding) encoding = state.defaultEncoding;
  if (typeof cb !== 'function') cb = nop;
  if (state.ending) writeAfterEnd(this, cb);else if (isBuf || validChunk(this, state, chunk, cb)) {
    state.pendingcb++;
    ret = writeOrBuffer(this, state, isBuf, chunk, encoding, cb);
  }
  return ret;
};

Writable.prototype.cork = function () {
  this._writableState.corked++;
};

Writable.prototype.uncork = function () {
  var state = this._writableState;

  if (state.corked) {
    state.corked--;
    if (!state.writing && !state.corked && !state.bufferProcessing && state.bufferedRequest) clearBuffer(this, state);
  }
};

Writable.prototype.setDefaultEncoding = function setDefaultEncoding(encoding) {
  // node::ParseEncoding() requires lower case.
  if (typeof encoding === 'string') encoding = encoding.toLowerCase();
  if (!(['hex', 'utf8', 'utf-8', 'ascii', 'binary', 'base64', 'ucs2', 'ucs-2', 'utf16le', 'utf-16le', 'raw'].indexOf((encoding + '').toLowerCase()) > -1)) throw new ERR_UNKNOWN_ENCODING(encoding);
  this._writableState.defaultEncoding = encoding;
  return this;
};

Object.defineProperty(Writable.prototype, 'writableBuffer', {
  // making it explicit this property is not enumerable
  // because otherwise some prototype manipulation in
  // userland will fail
  enumerable: false,
  get: function get() {
    return this._writableState && this._writableState.getBuffer();
  }
});

function decodeChunk(state, chunk, encoding) {
  if (!state.objectMode && state.decodeStrings !== false && typeof chunk === 'string') {
    chunk = Buffer.from(chunk, encoding);
  }

  return chunk;
}

Object.defineProperty(Writable.prototype, 'writableHighWaterMark', {
  // making it explicit this property is not enumerable
  // because otherwise some prototype manipulation in
  // userland will fail
  enumerable: false,
  get: function get() {
    return this._writableState.highWaterMark;
  }
}); // if we're already writing something, then just put this
// in the queue, and wait our turn.  Otherwise, call _write
// If we return false, then we need a drain event, so set that flag.

function writeOrBuffer(stream, state, isBuf, chunk, encoding, cb) {
  if (!isBuf) {
    var newChunk = decodeChunk(state, chunk, encoding);

    if (chunk !== newChunk) {
      isBuf = true;
      encoding = 'buffer';
      chunk = newChunk;
    }
  }

  var len = state.objectMode ? 1 : chunk.length;
  state.length += len;
  var ret = state.length < state.highWaterMark; // we must ensure that previous needDrain will not be reset to false.

  if (!ret) state.needDrain = true;

  if (state.writing || state.corked) {
    var last = state.lastBufferedRequest;
    state.lastBufferedRequest = {
      chunk: chunk,
      encoding: encoding,
      isBuf: isBuf,
      callback: cb,
      next: null
    };

    if (last) {
      last.next = state.lastBufferedRequest;
    } else {
      state.bufferedRequest = state.lastBufferedRequest;
    }

    state.bufferedRequestCount += 1;
  } else {
    doWrite(stream, state, false, len, chunk, encoding, cb);
  }

  return ret;
}

function doWrite(stream, state, writev, len, chunk, encoding, cb) {
  state.writelen = len;
  state.writecb = cb;
  state.writing = true;
  state.sync = true;
  if (state.destroyed) state.onwrite(new ERR_STREAM_DESTROYED('write'));else if (writev) stream._writev(chunk, state.onwrite);else stream._write(chunk, encoding, state.onwrite);
  state.sync = false;
}

function onwriteError(stream, state, sync, er, cb) {
  --state.pendingcb;

  if (sync) {
    // defer the callback if we are being called synchronously
    // to avoid piling up things on the stack
    process.nextTick(cb, er); // this can emit finish, and it will always happen
    // after error

    process.nextTick(finishMaybe, stream, state);
    stream._writableState.errorEmitted = true;
    stream.emit('error', er);
  } else {
    // the caller expect this to happen before if
    // it is async
    cb(er);
    stream._writableState.errorEmitted = true;
    stream.emit('error', er); // this can emit finish, but finish must
    // always follow error

    finishMaybe(stream, state);
  }
}

function onwriteStateUpdate(state) {
  state.writing = false;
  state.writecb = null;
  state.length -= state.writelen;
  state.writelen = 0;
}

function onwrite(stream, er) {
  var state = stream._writableState;
  var sync = state.sync;
  var cb = state.writecb;
  if (typeof cb !== 'function') throw new ERR_MULTIPLE_CALLBACK();
  onwriteStateUpdate(state);
  if (er) onwriteError(stream, state, sync, er, cb);else {
    // Check if we're actually ready to finish, but don't emit yet
    var finished = needFinish(state) || stream.destroyed;

    if (!finished && !state.corked && !state.bufferProcessing && state.bufferedRequest) {
      clearBuffer(stream, state);
    }

    if (sync) {
      process.nextTick(afterWrite, stream, state, finished, cb);
    } else {
      afterWrite(stream, state, finished, cb);
    }
  }
}

function afterWrite(stream, state, finished, cb) {
  if (!finished) onwriteDrain(stream, state);
  state.pendingcb--;
  cb();
  finishMaybe(stream, state);
} // Must force callback to be called on nextTick, so that we don't
// emit 'drain' before the write() consumer gets the 'false' return
// value, and has a chance to attach a 'drain' listener.


function onwriteDrain(stream, state) {
  if (state.length === 0 && state.needDrain) {
    state.needDrain = false;
    stream.emit('drain');
  }
} // if there's something in the buffer waiting, then process it


function clearBuffer(stream, state) {
  state.bufferProcessing = true;
  var entry = state.bufferedRequest;

  if (stream._writev && entry && entry.next) {
    // Fast case, write everything using _writev()
    var l = state.bufferedRequestCount;
    var buffer = new Array(l);
    var holder = state.corkedRequestsFree;
    holder.entry = entry;
    var count = 0;
    var allBuffers = true;

    while (entry) {
      buffer[count] = entry;
      if (!entry.isBuf) allBuffers = false;
      entry = entry.next;
      count += 1;
    }

    buffer.allBuffers = allBuffers;
    doWrite(stream, state, true, state.length, buffer, '', holder.finish); // doWrite is almost always async, defer these to save a bit of time
    // as the hot path ends with doWrite

    state.pendingcb++;
    state.lastBufferedRequest = null;

    if (holder.next) {
      state.corkedRequestsFree = holder.next;
      holder.next = null;
    } else {
      state.corkedRequestsFree = new CorkedRequest(state);
    }

    state.bufferedRequestCount = 0;
  } else {
    // Slow case, write chunks one-by-one
    while (entry) {
      var chunk = entry.chunk;
      var encoding = entry.encoding;
      var cb = entry.callback;
      var len = state.objectMode ? 1 : chunk.length;
      doWrite(stream, state, false, len, chunk, encoding, cb);
      entry = entry.next;
      state.bufferedRequestCount--; // if we didn't call the onwrite immediately, then
      // it means that we need to wait until it does.
      // also, that means that the chunk and cb are currently
      // being processed, so move the buffer counter past them.

      if (state.writing) {
        break;
      }
    }

    if (entry === null) state.lastBufferedRequest = null;
  }

  state.bufferedRequest = entry;
  state.bufferProcessing = false;
}

Writable.prototype._write = function (chunk, encoding, cb) {
  cb(new ERR_METHOD_NOT_IMPLEMENTED('_write()'));
};

Writable.prototype._writev = null;

Writable.prototype.end = function (chunk, encoding, cb) {
  var state = this._writableState;

  if (typeof chunk === 'function') {
    cb = chunk;
    chunk = null;
    encoding = null;
  } else if (typeof encoding === 'function') {
    cb = encoding;
    encoding = null;
  }

  if (chunk !== null && chunk !== undefined) this.write(chunk, encoding); // .end() fully uncorks

  if (state.corked) {
    state.corked = 1;
    this.uncork();
  } // ignore unnecessary end() calls.


  if (!state.ending) endWritable(this, state, cb);
  return this;
};

Object.defineProperty(Writable.prototype, 'writableLength', {
  // making it explicit this property is not enumerable
  // because otherwise some prototype manipulation in
  // userland will fail
  enumerable: false,
  get: function get() {
    return this._writableState.length;
  }
});

function needFinish(state) {
  return state.ending && state.length === 0 && state.bufferedRequest === null && !state.finished && !state.writing;
}

function callFinal(stream, state) {
  stream._final(function (err) {
    state.pendingcb--;

    if (err) {
      stream.emit('error', err);
    }

    state.prefinished = true;
    stream.emit('prefinish');
    finishMaybe(stream, state);
  });
}

function prefinish(stream, state) {
  if (!state.prefinished && !state.finalCalled) {
    if (typeof stream._final === 'function' && !state.destroyed) {
      state.pendingcb++;
      state.finalCalled = true;
      process.nextTick(callFinal, stream, state);
    } else {
      state.prefinished = true;
      stream.emit('prefinish');
    }
  }
}

function finishMaybe(stream, state) {
  var need = needFinish(state);

  if (need) {
    prefinish(stream, state);

    if (state.pendingcb === 0) {
      state.finished = true;
      stream.emit('finish');
    }
  }

  return need;
}

function endWritable(stream, state, cb) {
  state.ending = true;
  finishMaybe(stream, state);

  if (cb) {
    if (state.finished) process.nextTick(cb);else stream.once('finish', cb);
  }

  state.ended = true;
  stream.writable = false;
}

function onCorkedFinish(corkReq, state, err) {
  var entry = corkReq.entry;
  corkReq.entry = null;

  while (entry) {
    var cb = entry.callback;
    state.pendingcb--;
    cb(err);
    entry = entry.next;
  } // reuse the free corkReq.


  state.corkedRequestsFree.next = corkReq;
}

Object.defineProperty(Writable.prototype, 'destroyed', {
  // making it explicit this property is not enumerable
  // because otherwise some prototype manipulation in
  // userland will fail
  enumerable: false,
  get: function get() {
    if (this._writableState === undefined) {
      return false;
    }

    return this._writableState.destroyed;
  },
  set: function set(value) {
    // we ignore the value if the stream
    // has not been initialized yet
    if (!this._writableState) {
      return;
    } // backward compatibility, the user is explicitly
    // managing destroyed


    this._writableState.destroyed = value;
  }
});
Writable.prototype.destroy = destroyImpl.destroy;
Writable.prototype._undestroy = destroyImpl.undestroy;

Writable.prototype._destroy = function (err, cb) {
  cb(err);
};
}).call(this,require('_process'),typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"../errors":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hyperswarm-proxy/node_modules/readable-stream/errors-browser.js","./_stream_duplex":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hyperswarm-proxy/node_modules/readable-stream/lib/_stream_duplex.js","./internal/streams/destroy":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hyperswarm-proxy/node_modules/readable-stream/lib/internal/streams/destroy.js","./internal/streams/state":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hyperswarm-proxy/node_modules/readable-stream/lib/internal/streams/state.js","./internal/streams/stream":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hyperswarm-proxy/node_modules/readable-stream/lib/internal/streams/stream-browser.js","_process":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/process/browser.js","buffer":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/buffer/index.js","inherits":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/inherits/inherits_browser.js","util-deprecate":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/util-deprecate/browser.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hyperswarm-proxy/node_modules/readable-stream/lib/internal/streams/async_iterator.js":[function(require,module,exports){
(function (process){
'use strict';

var _Object$setPrototypeO;

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

var finished = require('./end-of-stream');

var kLastResolve = Symbol('lastResolve');
var kLastReject = Symbol('lastReject');
var kError = Symbol('error');
var kEnded = Symbol('ended');
var kLastPromise = Symbol('lastPromise');
var kHandlePromise = Symbol('handlePromise');
var kStream = Symbol('stream');

function createIterResult(value, done) {
  return {
    value: value,
    done: done
  };
}

function readAndResolve(iter) {
  var resolve = iter[kLastResolve];

  if (resolve !== null) {
    var data = iter[kStream].read(); // we defer if data is null
    // we can be expecting either 'end' or
    // 'error'

    if (data !== null) {
      iter[kLastPromise] = null;
      iter[kLastResolve] = null;
      iter[kLastReject] = null;
      resolve(createIterResult(data, false));
    }
  }
}

function onReadable(iter) {
  // we wait for the next tick, because it might
  // emit an error with process.nextTick
  process.nextTick(readAndResolve, iter);
}

function wrapForNext(lastPromise, iter) {
  return function (resolve, reject) {
    lastPromise.then(function () {
      if (iter[kEnded]) {
        resolve(createIterResult(undefined, true));
        return;
      }

      iter[kHandlePromise](resolve, reject);
    }, reject);
  };
}

var AsyncIteratorPrototype = Object.getPrototypeOf(function () {});
var ReadableStreamAsyncIteratorPrototype = Object.setPrototypeOf((_Object$setPrototypeO = {
  get stream() {
    return this[kStream];
  },

  next: function next() {
    var _this = this;

    // if we have detected an error in the meanwhile
    // reject straight away
    var error = this[kError];

    if (error !== null) {
      return Promise.reject(error);
    }

    if (this[kEnded]) {
      return Promise.resolve(createIterResult(undefined, true));
    }

    if (this[kStream].destroyed) {
      // We need to defer via nextTick because if .destroy(err) is
      // called, the error will be emitted via nextTick, and
      // we cannot guarantee that there is no error lingering around
      // waiting to be emitted.
      return new Promise(function (resolve, reject) {
        process.nextTick(function () {
          if (_this[kError]) {
            reject(_this[kError]);
          } else {
            resolve(createIterResult(undefined, true));
          }
        });
      });
    } // if we have multiple next() calls
    // we will wait for the previous Promise to finish
    // this logic is optimized to support for await loops,
    // where next() is only called once at a time


    var lastPromise = this[kLastPromise];
    var promise;

    if (lastPromise) {
      promise = new Promise(wrapForNext(lastPromise, this));
    } else {
      // fast path needed to support multiple this.push()
      // without triggering the next() queue
      var data = this[kStream].read();

      if (data !== null) {
        return Promise.resolve(createIterResult(data, false));
      }

      promise = new Promise(this[kHandlePromise]);
    }

    this[kLastPromise] = promise;
    return promise;
  }
}, _defineProperty(_Object$setPrototypeO, Symbol.asyncIterator, function () {
  return this;
}), _defineProperty(_Object$setPrototypeO, "return", function _return() {
  var _this2 = this;

  // destroy(err, cb) is a private API
  // we can guarantee we have that here, because we control the
  // Readable class this is attached to
  return new Promise(function (resolve, reject) {
    _this2[kStream].destroy(null, function (err) {
      if (err) {
        reject(err);
        return;
      }

      resolve(createIterResult(undefined, true));
    });
  });
}), _Object$setPrototypeO), AsyncIteratorPrototype);

var createReadableStreamAsyncIterator = function createReadableStreamAsyncIterator(stream) {
  var _Object$create;

  var iterator = Object.create(ReadableStreamAsyncIteratorPrototype, (_Object$create = {}, _defineProperty(_Object$create, kStream, {
    value: stream,
    writable: true
  }), _defineProperty(_Object$create, kLastResolve, {
    value: null,
    writable: true
  }), _defineProperty(_Object$create, kLastReject, {
    value: null,
    writable: true
  }), _defineProperty(_Object$create, kError, {
    value: null,
    writable: true
  }), _defineProperty(_Object$create, kEnded, {
    value: stream._readableState.endEmitted,
    writable: true
  }), _defineProperty(_Object$create, kHandlePromise, {
    value: function value(resolve, reject) {
      var data = iterator[kStream].read();

      if (data) {
        iterator[kLastPromise] = null;
        iterator[kLastResolve] = null;
        iterator[kLastReject] = null;
        resolve(createIterResult(data, false));
      } else {
        iterator[kLastResolve] = resolve;
        iterator[kLastReject] = reject;
      }
    },
    writable: true
  }), _Object$create));
  iterator[kLastPromise] = null;
  finished(stream, function (err) {
    if (err && err.code !== 'ERR_STREAM_PREMATURE_CLOSE') {
      var reject = iterator[kLastReject]; // reject if we are waiting for data in the Promise
      // returned by next() and store the error

      if (reject !== null) {
        iterator[kLastPromise] = null;
        iterator[kLastResolve] = null;
        iterator[kLastReject] = null;
        reject(err);
      }

      iterator[kError] = err;
      return;
    }

    var resolve = iterator[kLastResolve];

    if (resolve !== null) {
      iterator[kLastPromise] = null;
      iterator[kLastResolve] = null;
      iterator[kLastReject] = null;
      resolve(createIterResult(undefined, true));
    }

    iterator[kEnded] = true;
  });
  stream.on('readable', onReadable.bind(null, iterator));
  return iterator;
};

module.exports = createReadableStreamAsyncIterator;
}).call(this,require('_process'))
},{"./end-of-stream":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hyperswarm-proxy/node_modules/readable-stream/lib/internal/streams/end-of-stream.js","_process":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/process/browser.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hyperswarm-proxy/node_modules/readable-stream/lib/internal/streams/buffer_list.js":[function(require,module,exports){
'use strict';

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; var ownKeys = Object.keys(source); if (typeof Object.getOwnPropertySymbols === 'function') { ownKeys = ownKeys.concat(Object.getOwnPropertySymbols(source).filter(function (sym) { return Object.getOwnPropertyDescriptor(source, sym).enumerable; })); } ownKeys.forEach(function (key) { _defineProperty(target, key, source[key]); }); } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

var _require = require('buffer'),
    Buffer = _require.Buffer;

var _require2 = require('util'),
    inspect = _require2.inspect;

var custom = inspect && inspect.custom || 'inspect';

function copyBuffer(src, target, offset) {
  Buffer.prototype.copy.call(src, target, offset);
}

module.exports =
/*#__PURE__*/
function () {
  function BufferList() {
    this.head = null;
    this.tail = null;
    this.length = 0;
  }

  var _proto = BufferList.prototype;

  _proto.push = function push(v) {
    var entry = {
      data: v,
      next: null
    };
    if (this.length > 0) this.tail.next = entry;else this.head = entry;
    this.tail = entry;
    ++this.length;
  };

  _proto.unshift = function unshift(v) {
    var entry = {
      data: v,
      next: this.head
    };
    if (this.length === 0) this.tail = entry;
    this.head = entry;
    ++this.length;
  };

  _proto.shift = function shift() {
    if (this.length === 0) return;
    var ret = this.head.data;
    if (this.length === 1) this.head = this.tail = null;else this.head = this.head.next;
    --this.length;
    return ret;
  };

  _proto.clear = function clear() {
    this.head = this.tail = null;
    this.length = 0;
  };

  _proto.join = function join(s) {
    if (this.length === 0) return '';
    var p = this.head;
    var ret = '' + p.data;

    while (p = p.next) {
      ret += s + p.data;
    }

    return ret;
  };

  _proto.concat = function concat(n) {
    if (this.length === 0) return Buffer.alloc(0);
    var ret = Buffer.allocUnsafe(n >>> 0);
    var p = this.head;
    var i = 0;

    while (p) {
      copyBuffer(p.data, ret, i);
      i += p.data.length;
      p = p.next;
    }

    return ret;
  } // Consumes a specified amount of bytes or characters from the buffered data.
  ;

  _proto.consume = function consume(n, hasStrings) {
    var ret;

    if (n < this.head.data.length) {
      // `slice` is the same for buffers and strings.
      ret = this.head.data.slice(0, n);
      this.head.data = this.head.data.slice(n);
    } else if (n === this.head.data.length) {
      // First chunk is a perfect match.
      ret = this.shift();
    } else {
      // Result spans more than one buffer.
      ret = hasStrings ? this._getString(n) : this._getBuffer(n);
    }

    return ret;
  };

  _proto.first = function first() {
    return this.head.data;
  } // Consumes a specified amount of characters from the buffered data.
  ;

  _proto._getString = function _getString(n) {
    var p = this.head;
    var c = 1;
    var ret = p.data;
    n -= ret.length;

    while (p = p.next) {
      var str = p.data;
      var nb = n > str.length ? str.length : n;
      if (nb === str.length) ret += str;else ret += str.slice(0, n);
      n -= nb;

      if (n === 0) {
        if (nb === str.length) {
          ++c;
          if (p.next) this.head = p.next;else this.head = this.tail = null;
        } else {
          this.head = p;
          p.data = str.slice(nb);
        }

        break;
      }

      ++c;
    }

    this.length -= c;
    return ret;
  } // Consumes a specified amount of bytes from the buffered data.
  ;

  _proto._getBuffer = function _getBuffer(n) {
    var ret = Buffer.allocUnsafe(n);
    var p = this.head;
    var c = 1;
    p.data.copy(ret);
    n -= p.data.length;

    while (p = p.next) {
      var buf = p.data;
      var nb = n > buf.length ? buf.length : n;
      buf.copy(ret, ret.length - n, 0, nb);
      n -= nb;

      if (n === 0) {
        if (nb === buf.length) {
          ++c;
          if (p.next) this.head = p.next;else this.head = this.tail = null;
        } else {
          this.head = p;
          p.data = buf.slice(nb);
        }

        break;
      }

      ++c;
    }

    this.length -= c;
    return ret;
  } // Make sure the linked list only shows the minimal necessary information.
  ;

  _proto[custom] = function (_, options) {
    return inspect(this, _objectSpread({}, options, {
      // Only inspect one level.
      depth: 0,
      // It should not recurse.
      customInspect: false
    }));
  };

  return BufferList;
}();
},{"buffer":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/buffer/index.js","util":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/browser-resolve/empty.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hyperswarm-proxy/node_modules/readable-stream/lib/internal/streams/destroy.js":[function(require,module,exports){
(function (process){
'use strict'; // undocumented cb() API, needed for core, not for public API

function destroy(err, cb) {
  var _this = this;

  var readableDestroyed = this._readableState && this._readableState.destroyed;
  var writableDestroyed = this._writableState && this._writableState.destroyed;

  if (readableDestroyed || writableDestroyed) {
    if (cb) {
      cb(err);
    } else if (err && (!this._writableState || !this._writableState.errorEmitted)) {
      process.nextTick(emitErrorNT, this, err);
    }

    return this;
  } // we set destroyed to true before firing error callbacks in order
  // to make it re-entrance safe in case destroy() is called within callbacks


  if (this._readableState) {
    this._readableState.destroyed = true;
  } // if this is a duplex stream mark the writable part as destroyed as well


  if (this._writableState) {
    this._writableState.destroyed = true;
  }

  this._destroy(err || null, function (err) {
    if (!cb && err) {
      process.nextTick(emitErrorAndCloseNT, _this, err);

      if (_this._writableState) {
        _this._writableState.errorEmitted = true;
      }
    } else if (cb) {
      process.nextTick(emitCloseNT, _this);
      cb(err);
    } else {
      process.nextTick(emitCloseNT, _this);
    }
  });

  return this;
}

function emitErrorAndCloseNT(self, err) {
  emitErrorNT(self, err);
  emitCloseNT(self);
}

function emitCloseNT(self) {
  if (self._writableState && !self._writableState.emitClose) return;
  if (self._readableState && !self._readableState.emitClose) return;
  self.emit('close');
}

function undestroy() {
  if (this._readableState) {
    this._readableState.destroyed = false;
    this._readableState.reading = false;
    this._readableState.ended = false;
    this._readableState.endEmitted = false;
  }

  if (this._writableState) {
    this._writableState.destroyed = false;
    this._writableState.ended = false;
    this._writableState.ending = false;
    this._writableState.finalCalled = false;
    this._writableState.prefinished = false;
    this._writableState.finished = false;
    this._writableState.errorEmitted = false;
  }
}

function emitErrorNT(self, err) {
  self.emit('error', err);
}

module.exports = {
  destroy: destroy,
  undestroy: undestroy
};
}).call(this,require('_process'))
},{"_process":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/process/browser.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hyperswarm-proxy/node_modules/readable-stream/lib/internal/streams/end-of-stream.js":[function(require,module,exports){
// Ported from https://github.com/mafintosh/end-of-stream with
// permission from the author, Mathias Buus (@mafintosh).
'use strict';

var ERR_STREAM_PREMATURE_CLOSE = require('../../../errors').codes.ERR_STREAM_PREMATURE_CLOSE;

function once(callback) {
  var called = false;
  return function () {
    if (called) return;
    called = true;

    for (var _len = arguments.length, args = new Array(_len), _key = 0; _key < _len; _key++) {
      args[_key] = arguments[_key];
    }

    callback.apply(this, args);
  };
}

function noop() {}

function isRequest(stream) {
  return stream.setHeader && typeof stream.abort === 'function';
}

function eos(stream, opts, callback) {
  if (typeof opts === 'function') return eos(stream, null, opts);
  if (!opts) opts = {};
  callback = once(callback || noop);
  var readable = opts.readable || opts.readable !== false && stream.readable;
  var writable = opts.writable || opts.writable !== false && stream.writable;

  var onlegacyfinish = function onlegacyfinish() {
    if (!stream.writable) onfinish();
  };

  var writableEnded = stream._writableState && stream._writableState.finished;

  var onfinish = function onfinish() {
    writable = false;
    writableEnded = true;
    if (!readable) callback.call(stream);
  };

  var readableEnded = stream._readableState && stream._readableState.endEmitted;

  var onend = function onend() {
    readable = false;
    readableEnded = true;
    if (!writable) callback.call(stream);
  };

  var onerror = function onerror(err) {
    callback.call(stream, err);
  };

  var onclose = function onclose() {
    var err;

    if (readable && !readableEnded) {
      if (!stream._readableState || !stream._readableState.ended) err = new ERR_STREAM_PREMATURE_CLOSE();
      return callback.call(stream, err);
    }

    if (writable && !writableEnded) {
      if (!stream._writableState || !stream._writableState.ended) err = new ERR_STREAM_PREMATURE_CLOSE();
      return callback.call(stream, err);
    }
  };

  var onrequest = function onrequest() {
    stream.req.on('finish', onfinish);
  };

  if (isRequest(stream)) {
    stream.on('complete', onfinish);
    stream.on('abort', onclose);
    if (stream.req) onrequest();else stream.on('request', onrequest);
  } else if (writable && !stream._writableState) {
    // legacy streams
    stream.on('end', onlegacyfinish);
    stream.on('close', onlegacyfinish);
  }

  stream.on('end', onend);
  stream.on('finish', onfinish);
  if (opts.error !== false) stream.on('error', onerror);
  stream.on('close', onclose);
  return function () {
    stream.removeListener('complete', onfinish);
    stream.removeListener('abort', onclose);
    stream.removeListener('request', onrequest);
    if (stream.req) stream.req.removeListener('finish', onfinish);
    stream.removeListener('end', onlegacyfinish);
    stream.removeListener('close', onlegacyfinish);
    stream.removeListener('finish', onfinish);
    stream.removeListener('end', onend);
    stream.removeListener('error', onerror);
    stream.removeListener('close', onclose);
  };
}

module.exports = eos;
},{"../../../errors":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hyperswarm-proxy/node_modules/readable-stream/errors-browser.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hyperswarm-proxy/node_modules/readable-stream/lib/internal/streams/pipeline.js":[function(require,module,exports){
// Ported from https://github.com/mafintosh/pump with
// permission from the author, Mathias Buus (@mafintosh).
'use strict';

var eos;

function once(callback) {
  var called = false;
  return function () {
    if (called) return;
    called = true;
    callback.apply(void 0, arguments);
  };
}

var _require$codes = require('../../../errors').codes,
    ERR_MISSING_ARGS = _require$codes.ERR_MISSING_ARGS,
    ERR_STREAM_DESTROYED = _require$codes.ERR_STREAM_DESTROYED;

function noop(err) {
  // Rethrow the error if it exists to avoid swallowing it
  if (err) throw err;
}

function isRequest(stream) {
  return stream.setHeader && typeof stream.abort === 'function';
}

function destroyer(stream, reading, writing, callback) {
  callback = once(callback);
  var closed = false;
  stream.on('close', function () {
    closed = true;
  });
  if (eos === undefined) eos = require('./end-of-stream');
  eos(stream, {
    readable: reading,
    writable: writing
  }, function (err) {
    if (err) return callback(err);
    closed = true;
    callback();
  });
  var destroyed = false;
  return function (err) {
    if (closed) return;
    if (destroyed) return;
    destroyed = true; // request.destroy just do .end - .abort is what we want

    if (isRequest(stream)) return stream.abort();
    if (typeof stream.destroy === 'function') return stream.destroy();
    callback(err || new ERR_STREAM_DESTROYED('pipe'));
  };
}

function call(fn) {
  fn();
}

function pipe(from, to) {
  return from.pipe(to);
}

function popCallback(streams) {
  if (!streams.length) return noop;
  if (typeof streams[streams.length - 1] !== 'function') return noop;
  return streams.pop();
}

function pipeline() {
  for (var _len = arguments.length, streams = new Array(_len), _key = 0; _key < _len; _key++) {
    streams[_key] = arguments[_key];
  }

  var callback = popCallback(streams);
  if (Array.isArray(streams[0])) streams = streams[0];

  if (streams.length < 2) {
    throw new ERR_MISSING_ARGS('streams');
  }

  var error;
  var destroys = streams.map(function (stream, i) {
    var reading = i < streams.length - 1;
    var writing = i > 0;
    return destroyer(stream, reading, writing, function (err) {
      if (!error) error = err;
      if (err) destroys.forEach(call);
      if (reading) return;
      destroys.forEach(call);
      callback(error);
    });
  });
  return streams.reduce(pipe);
}

module.exports = pipeline;
},{"../../../errors":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hyperswarm-proxy/node_modules/readable-stream/errors-browser.js","./end-of-stream":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hyperswarm-proxy/node_modules/readable-stream/lib/internal/streams/end-of-stream.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hyperswarm-proxy/node_modules/readable-stream/lib/internal/streams/state.js":[function(require,module,exports){
'use strict';

var ERR_INVALID_OPT_VALUE = require('../../../errors').codes.ERR_INVALID_OPT_VALUE;

function highWaterMarkFrom(options, isDuplex, duplexKey) {
  return options.highWaterMark != null ? options.highWaterMark : isDuplex ? options[duplexKey] : null;
}

function getHighWaterMark(state, options, duplexKey, isDuplex) {
  var hwm = highWaterMarkFrom(options, isDuplex, duplexKey);

  if (hwm != null) {
    if (!(isFinite(hwm) && Math.floor(hwm) === hwm) || hwm < 0) {
      var name = isDuplex ? duplexKey : 'highWaterMark';
      throw new ERR_INVALID_OPT_VALUE(name, hwm);
    }

    return Math.floor(hwm);
  } // Default value


  return state.objectMode ? 16 : 16 * 1024;
}

module.exports = {
  getHighWaterMark: getHighWaterMark
};
},{"../../../errors":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hyperswarm-proxy/node_modules/readable-stream/errors-browser.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hyperswarm-proxy/node_modules/readable-stream/lib/internal/streams/stream-browser.js":[function(require,module,exports){
module.exports = require('events').EventEmitter;

},{"events":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/browserify/node_modules/events/events.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hyperswarm-proxy/node_modules/readable-stream/readable-browser.js":[function(require,module,exports){
exports = module.exports = require('./lib/_stream_readable.js');
exports.Stream = exports;
exports.Readable = exports;
exports.Writable = require('./lib/_stream_writable.js');
exports.Duplex = require('./lib/_stream_duplex.js');
exports.Transform = require('./lib/_stream_transform.js');
exports.PassThrough = require('./lib/_stream_passthrough.js');
exports.finished = require('./lib/internal/streams/end-of-stream.js');
exports.pipeline = require('./lib/internal/streams/pipeline.js');

},{"./lib/_stream_duplex.js":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hyperswarm-proxy/node_modules/readable-stream/lib/_stream_duplex.js","./lib/_stream_passthrough.js":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hyperswarm-proxy/node_modules/readable-stream/lib/_stream_passthrough.js","./lib/_stream_readable.js":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hyperswarm-proxy/node_modules/readable-stream/lib/_stream_readable.js","./lib/_stream_transform.js":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hyperswarm-proxy/node_modules/readable-stream/lib/_stream_transform.js","./lib/_stream_writable.js":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hyperswarm-proxy/node_modules/readable-stream/lib/_stream_writable.js","./lib/internal/streams/end-of-stream.js":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hyperswarm-proxy/node_modules/readable-stream/lib/internal/streams/end-of-stream.js","./lib/internal/streams/pipeline.js":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hyperswarm-proxy/node_modules/readable-stream/lib/internal/streams/pipeline.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hyperswarm-proxy/node_modules/varint/decode.js":[function(require,module,exports){
arguments[4]["/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hypercore-protocol/node_modules/varint/decode.js"][0].apply(exports,arguments)
},{}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hyperswarm-proxy/node_modules/varint/encode.js":[function(require,module,exports){
arguments[4]["/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hypercore-protocol/node_modules/varint/encode.js"][0].apply(exports,arguments)
},{}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hyperswarm-proxy/node_modules/varint/index.js":[function(require,module,exports){
arguments[4]["/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hypercore-protocol/node_modules/varint/index.js"][0].apply(exports,arguments)
},{"./decode.js":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hyperswarm-proxy/node_modules/varint/decode.js","./encode.js":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hyperswarm-proxy/node_modules/varint/encode.js","./length.js":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hyperswarm-proxy/node_modules/varint/length.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hyperswarm-proxy/node_modules/varint/length.js":[function(require,module,exports){
arguments[4]["/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hypercore-protocol/node_modules/varint/length.js"][0].apply(exports,arguments)
},{}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hyperswarm-proxy/proxystream.js":[function(require,module,exports){
var Duplex = require('stream').Duplex

module.exports = class ProxyStream extends Duplex {
  constructor (protocol, id) {
    super({
      emitClose: true
    })
    this._secretId = Math.random()
    this._id = id
    this._protocol = protocol
    this._isClosed = false
    this._handle_data = this._handleData.bind(this)
    this._handle_close = this._handleClose.bind(this)
    this._handle_error = this._handleError.bind(this)

    this._protocol.on('on_stream_data', this._handle_data)
    this._protocol.on('on_stream_close', this._handle_close)
    this._protocol.on('on_stream_error', this._handle_error)
  }

  _handleData ({ stream, data }) {
    // See if the event was for this stream
    if (this._isId(stream)) {
      this.push(data)
    }
  }

  _handleClose ({ stream }) {
    if (this._isId(stream)) {
      this.destroy()
      this._cleanup()
    }
  }

  _handleError ({ stream, data }) {
    if (this._isId(stream)) {
      const message = data.toString('utf8')
      this.emit('error', new Error(message))
      this.destroy()
      this._cleanup()
    }
  }

  _cleanup () {
    this._isClosed = true
    this._protocol.removeListener('on_stream_data', this._handle_data)
    this._protocol.removeListener('on_stream_close', this._handle_close)
    this._protocol.removeListener('on_stream_error', this._handle_error)
  }

  _isId (streamid) {
    return streamid === this._id
  }

  _read () { }
  _write (chunk, encoding, callback) {
    this._protocol.onStreamData(this._id, chunk)
    callback()
  }

  _final (callback) {
    if (!this._isClosed) {
      this._protocol.onStreamClose(this._id)
      this._cleanup()
    }
    callback()
  }
}

},{"stream":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/stream-browserify/index.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hypertrie/index.js":[function(require,module,exports){
(function (Buffer,process){
const Node = require('./lib/node')
const Get = require('./lib/get')
const Put = require('./lib/put')
const Batch = require('./lib/batch')
const Delete = require('./lib/del')
const History = require('./lib/history')
const Iterator = require('./lib/iterator')
const Watch = require('./lib/watch')
const Diff = require('./lib/diff')
const { Header } = require('./lib/messages')
const mutexify = require('mutexify')
const thunky = require('thunky')
const codecs = require('codecs')
const bulk = require('bulk-write-stream')
const toStream = require('nanoiterator/to-stream')
const isOptions = require('is-options')
const hypercore = require('hypercore')
const inherits = require('inherits')
const events = require('events')

module.exports = HyperTrie

function HyperTrie (storage, key, opts) {
  if (!(this instanceof HyperTrie)) return new HyperTrie(storage, key, opts)

  if (isOptions(key)) {
    opts = key
    key = null
  }

  if (!opts) opts = {}

  events.EventEmitter.call(this)

  this.id = null
  this.key = null
  this.discoveryKey = null
  this.secretKey = null
  this.metadata = opts.metadata || null
  this.valueEncoding = opts.valueEncoding ? codecs(opts.valueEncoding) : null

  const feedOpts = Object.assign({}, opts, { valueEncoding: 'binary' })
  this.feed = opts.feed || hypercore(storage, key, feedOpts)
  this.opened = false
  this.ready = thunky(this._ready.bind(this))

  this._watchers = []
  this._checkout = (opts && opts.checkout) || 0
  this._lock = mutexify()

  if (this.feed !== opts.feed) this.feed.on('error', this._onerror.bind(this))
  if (!this._checkout) this.feed.on('append', this._onappend.bind(this))
}

inherits(HyperTrie, events.EventEmitter)

Object.defineProperty(HyperTrie.prototype, 'version', {
  enumerable: true,
  get: function () {
    return this._checkout || this.feed.length
  }
})

HyperTrie.prototype._onerror = function (err) {
  this.emit('error', err)
}

HyperTrie.prototype._onappend = function () {
  for (var i = 0; i < this._watchers.length; i++) {
    this._watchers[i].update()
  }

  this.emit('append')
}

HyperTrie.prototype._ready = function (cb) {
  const self = this

  this.feed.ready(function (err) {
    if (err) return done(err)

    if (self.feed.length || !self.feed.writable) return done(null)
    self.feed.append(Header.encode({type: 'hypertrie', metadata: self.metadata}), done)

    function done (err) {
      if (err) return cb(err)
      if (self._checkout === -1) self._checkout = self.feed.length
      self.id = self.feed.id
      self.key = self.feed.key
      self.discoveryKey = self.feed.discoveryKey
      self.secretKey = self.feed.secretKey
      self.opened = true
      self.emit('ready')
      cb(null)
    }
  })
}

HyperTrie.prototype.getMetadata = function (cb) {
  this.feed.get(0, { valueEncoding: Header }, (err, header) => {
    if (err) return cb(err)
    return cb(null, header.metadata)
  })
}

HyperTrie.prototype.setMetadata = function (metadata) {
  // setMetadata can only be called before this.ready is first called.
  if (this.feed.length || !this.feed.writable) throw new Error('The metadata must be set before any puts have occurred.')
  this.metadata = metadata
}

HyperTrie.prototype.replicate = function (opts) {
  return this.feed.replicate(opts)
}

HyperTrie.prototype.checkout = function (version) {
  if (version === 0) version = 1
  return new HyperTrie(null, null, {
    checkout: version || 1,
    valueEncoding: this.valueEncoding,
    feed: this.feed
  })
}

HyperTrie.prototype.snapshot = function () {
  return this.checkout(this.version)
}

HyperTrie.prototype.head = function (cb) {
  if (!this.opened) return readyAndHead(this, cb)
  if (this._checkout !== 0) return this.getBySeq(this._checkout - 1, cb)
  if (this.feed.length < 2) return process.nextTick(cb, null, null)
  this.getBySeq(this.feed.length - 1, cb)
}

HyperTrie.prototype.list = function (prefix, opts, cb) {
  if (typeof prefix === 'function') return this.list('', null, prefix)
  if (typeof opts === 'function') return this.list(prefix, null, opts)

  const ite = this.iterator(prefix, opts)
  const res = []

  ite.next(function loop (err, node) {
    if (err) return cb(err)
    if (!node) return cb(null, res)
    res.push(node)
    ite.next(loop)
  })
}

HyperTrie.prototype.iterator = function (prefix, opts) {
  if (isOptions(prefix)) return this.iterator('', prefix)
  return new Iterator(this, prefix, opts)
}

HyperTrie.prototype.createReadStream = function (prefix, opts) {
  return toStream(this.iterator(prefix, opts))
}

HyperTrie.prototype.history = function (opts) {
  return new History(this, opts)
}

HyperTrie.prototype.createHistoryStream = function (opts) {
  return toStream(this.history(opts))
}

HyperTrie.prototype.diff = function (other, prefix, opts) {
  if (Buffer.isBuffer(other)) return this.diff(0, prefix, Object.assign(opts || {}, { checkpoint: other }))
  if (isOptions(prefix)) return this.diff(other, null, prefix)
  const checkout = (typeof other === 'number' || !other) ? this.checkout(other) : other
  return new Diff(this, checkout, prefix, opts)
}

HyperTrie.prototype.createDiffStream = function (other, prefix, opts) {
  return toStream(this.diff(other, prefix, opts))
}

HyperTrie.prototype.get = function (key, opts, cb) {
  if (typeof opts === 'function') return this.get(key, null, opts)
  return new Get(this, key, opts, cb)
}

HyperTrie.prototype.watch = function (key, onchange) {
  if (typeof key === 'function') return this.watch('', key)
  return new Watch(this, key, onchange)
}

HyperTrie.prototype.batch = function (ops, cb) {
  return new Batch(this, ops, cb || noop)
}

HyperTrie.prototype.put = function (key, value, opts, cb) {
  if (typeof opts === 'function') return this.put(key, value, null, opts)
  opts = Object.assign({}, opts, {
    batch: null,
    del: 0
  })
  return new Put(this, key, value, opts, cb || noop)
}

HyperTrie.prototype.del = function (key, opts, cb) {
  if (typeof opts === 'function') return this.del(key, null, opts)
  opts = Object.assign({}, opts, {
    batch: null
  })
  return new Delete(this, key, opts, cb)
}

HyperTrie.prototype.createWriteStream = function (opts) {
  const self = this
  return bulk.obj(write)

  function write (batch, cb) {
    if (batch.length && Array.isArray(batch[0])) batch = flatten(batch)
    self.batch(batch, cb)
  }
}

HyperTrie.prototype.getBySeq = function (seq, opts, cb) {
  if (typeof opts === 'function') return this.getBySeq(seq, null, opts)
  if (seq < 1) return process.nextTick(cb, null, null)

  const self = this
  this.feed.get(seq, opts, onnode)

  function onnode (err, val) {
    if (err) return cb(err)
    const node = Node.decode(val, seq, self.valueEncoding)
    // early exit for the key: '' nodes we write to reset the db
    if (!node.value && !node.key) return cb(null, null)
    cb(null, node)
  }
}

function noop () {}

function readyAndHead (self, cb) {
  self.ready(function (err) {
    if (err) return cb(err)
    self.head(cb)
  })
}

function flatten (list) {
  const result = []
  for (var i = 0; i < list.length; i++) {
    const next = list[i]
    for (var j = 0; j < next.length; j++) result.push(next[j])
  }
  return result
}

}).call(this,{"isBuffer":require("../is-buffer/index.js")},require('_process'))
},{"../is-buffer/index.js":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/is-buffer/index.js","./lib/batch":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hypertrie/lib/batch.js","./lib/del":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hypertrie/lib/del.js","./lib/diff":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hypertrie/lib/diff.js","./lib/get":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hypertrie/lib/get.js","./lib/history":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hypertrie/lib/history.js","./lib/iterator":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hypertrie/lib/iterator.js","./lib/messages":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hypertrie/lib/messages.js","./lib/node":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hypertrie/lib/node.js","./lib/put":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hypertrie/lib/put.js","./lib/watch":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hypertrie/lib/watch.js","_process":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/process/browser.js","bulk-write-stream":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/bulk-write-stream/index.js","codecs":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/codecs/index.js","events":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/browserify/node_modules/events/events.js","hypercore":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hypercore/index.js","inherits":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/inherits/inherits_browser.js","is-options":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/is-options/index.js","mutexify":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/mutexify/index.js","nanoiterator/to-stream":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/nanoiterator/to-stream.js","thunky":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/thunky/index.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hypertrie/lib/batch.js":[function(require,module,exports){
const Put = require('./put')
const Delete = require('./del')

module.exports = Batch

function Batch (db, ops, cb) {
  this._db = db
  this._ops = ops
  this._callback = cb
  this._head = null
  this._nodes = []
  this._offset = 0
  this._op = null
  this._start()
}

Batch.prototype.get = function (seq) {
  if (seq < this._offset) return null
  return this._nodes[seq - this._offset]
}

Batch.prototype.head = function () {
  return this._head
}

Batch.prototype.append = function (node) {
  node.seq = this._offset + this._nodes.length
  node.preencode()
  this._nodes.push(node)
}

Batch.prototype._finalize = function (err) {
  const self = this
  if (err) return done(err)

  const buffers = new Array(this._nodes.length)
  for (var i = 0; i < buffers.length; i++) {
    buffers[i] = this._nodes[i].encode()
  }

  this._db.feed.append(buffers, done)

  function done (err) {
    self._release(self._callback, err, self._nodes)
  }
}

Batch.prototype._start = function () {
  const self = this
  this._db._lock(function (release) {
    self._release = release
    self._db.ready(function () {
      self._offset = self._db.feed.length
      self._db.head(function (err, head) {
        if (err) return self._finalize(err)
        self._head = head
        self._update()
      })
    })
  })
}

Batch.prototype._update = function () {
  var i = 0
  const self = this

  loop(null, null)

  function loop (err, head) {
    if (err) return self._finalize(err)
    if (i === self._ops.length) return self._finalize(null)
    if (head) self._head = head

    const {type, key, value, hidden, flags} = self._ops[i++]
    if (type === 'del') self._op = new Delete(self._db, key, { batch: self, hidden }, loop)
    else self._op = new Put(self._db, key, value === undefined ? null : value, { batch: self, del: 0, hidden, flags }, loop)
  }
}

},{"./del":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hypertrie/lib/del.js","./put":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hypertrie/lib/put.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hypertrie/lib/del.js":[function(require,module,exports){
(function (process){
const Put = require('./put')
const Node = require('./node')

module.exports = Delete

function Delete (db, key, { batch, condition = null, hidden = false, closest = false }, cb) {
  this._db = db
  this._key = key
  this._callback = cb
  this._release = null
  this._put = null
  this._batch = batch
  this._condition = condition
  this._node = new Node({key, flags: hidden ? Node.Flags.HIDDEN : 0})
  this._length = this._node.length
  this._returnClosest = closest
  this._closestNode = null
  this._closest = 0

  if (this._batch) this._update(0, this._batch.head())
  else this._lock()
}

Delete.prototype._lock = function () {
  const self = this
  this._db._lock(function (release) {
    self._release = release
    self._start()
  })
}

Delete.prototype._start = function () {
  const self = this
  this._db.head(onhead)

  function onhead (err, head) {
    if (err) return self._finalize(err, null)
    if (!head) return self._finalize(null, null)
    self._update(0, head)
  }
}

Delete.prototype._finalize = function (err, node) {
  if (!this._release) this._callback(err, node)
  else this._release(this._callback, err, node)
}

Delete.prototype._splice = function (closest, node) {
  const key = closest ? closest.key : ''
  const valueBuffer = closest ? closest.valueBuffer : null
  const hidden = closest ? closest.hidden : node.hidden
  const flags = closest ? closest.flags >> 8 : 0
  const self = this
  if (this._condition) this._condition(node.final(), oncondition)
  else del()

  function oncondition (err, proceed) {
    if (err) return done(err)
    if (!proceed) return done(null)
    return del()
  }

  function del () {
    self._put = new Put(self._db, key, null, { batch: self._batch, del: node.seq, hidden, valueBuffer, flags }, done)
  }

  function done (err, node) {
    self._finalize(err, node)
  }
}

Delete.prototype._update = function (i, head) {
  const self = this
  if (!head) return terminate()

  const node = this._node

  for (; i < this._length; i++) {
    const val = node.path(i)
    const bucket = head.trie[i] || []

    if (head.path(i) === val) {
      const closest = firstSeq(bucket, val)
      if (closest) this._closest = closest
      continue
    }

    const seq = bucket[val]
    if (!seq) return terminate()

    this._closest = head.seq
    this._updateHead(i, seq)
    return
  }

  // TODO: collisions
  if (node.key !== head.key) return terminate()
  this._spliceClosest(head)

  function terminate () {
    if (self._condition && self._returnClosest) {
      return self._condition(self._closestNode && self._closestNode.final(), (err, proceed) => {
        if (err) return self._finalize(err)
        return self._finalize(null, null)
      })
    }
    return self._finalize(null, null)
  }
}

Delete.prototype._spliceClosest = function (head) {
  if (!this._closest) return this._splice(null, head)

  const self = this

  this._get(this._closest, function (err, closest) {
    if (err) return self._finalize(err, null)
    self._splice(closest, head)
  })
}

Delete.prototype._get = function (seq, onnode) {
  const node = this._batch && this._batch.get(seq)
  if (node) return process.nextTick(onnode, null, node)
  this._db.getBySeq(seq, onnode)
}

Delete.prototype._updateHead = function (i, seq) {
  const self = this
  this._get(seq, onnode)

  function onnode (err, node) {
    if (err) return self._finalize(err, null)
    self._closestNode = node || self._closestNode
    self._update(i + 1, node)
  }
}

function firstSeq (bucket, val) {
  for (var i = 0; i < bucket.length; i++) {
    if (i === val) continue
    const seq = bucket[i]
    if (seq) return seq
  }
  return 0
}

}).call(this,require('_process'))
},{"./node":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hypertrie/lib/node.js","./put":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hypertrie/lib/put.js","_process":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/process/browser.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hypertrie/lib/diff.js":[function(require,module,exports){
(function (Buffer){
const Nanoiterator = require('nanoiterator')
const inherits = require('inherits')
const Node = require('./node')
const varint = require('varint')

module.exports = Diff

function Diff (db, checkout, prefix, opts) {
  Nanoiterator.call(this)

  this._db = db
  this._prefix = prefix || ''
  this._checkout = checkout
  this._stack = []
  this._pending = 0
  this._error = null
  this._callback = null
  this._left = []
  this._right = []
  this._onnode = (opts && opts.onnode) || null
  this._hidden = !!(opts && opts.hidden)
  this._needsCheck = []
  this._skipLeftNull = !!(opts && opts.skipLeftNull)
  this._skipRightNull = !!(opts && opts.skipRightNull)
  this._checkpoint = (opts && opts.checkpoint) || null
}

inherits(Diff, Nanoiterator)

Diff.prototype._open = function (cb) {
  if (this._checkpoint) return this._openCheckpoint(cb)

  const self = this
  const opts = {onnode: this._onnode, prefix: true, hidden: this._hidden}
  const get = this._db.get(this._prefix, opts, function (err, a) {
    if (err) return cb(err)
    self._checkout.get(self._prefix, opts, function (err, b) {
      if (err) return cb(err)
      self._stack.push({i: get._length, left: a, right: b, skip: false})
      cb(null)
    })
  })
}

Diff.prototype._openCheckpoint = function (cb) {
  const self = this
  const buf = this._checkpoint
  var ptr = 0

  loop()

  function loop () {
    if (ptr >= buf.length) return cb(null)

    const i = varint.decode(buf, ptr)
    ptr += varint.decode.bytes
    const l = varint.decode(buf, ptr)
    ptr += varint.decode.bytes
    const r = varint.decode(buf, ptr)
    ptr += varint.decode.bytes

    self._db.getBySeq(l, function (err, left) {
      if (err) return cb(err)
      self._db.getBySeq(r, function (err, right) {
        if (err) return cb(err)
        self._stack.push({i, left, right, skip: false})
        loop()
      })
    })
  }
}

Diff.prototype.checkpoint = function () {
  const buf = Buffer.alloc(this._stack.length * 8 * 3)
  var ptr = 0

  for (var i = 0; i < this._stack.length; i++) {
    const s = this._stack[i]
    if (s.skip) continue
    varint.encode(s.i, buf, ptr)
    ptr += varint.encode.bytes
    varint.encode(s.left ? s.left.seq : 0, buf, ptr)
    ptr += varint.encode.bytes
    varint.encode(s.right ? s.right.seq : 0, buf, ptr)
    ptr += varint.encode.bytes
  }
  return buf.slice(0, ptr)
}

Diff.prototype._finalize = function () {
  const callback = this._callback
  if (!callback) return

  const err = this._error
  this._callback = this._error = null
  if (err) return callback(err)

  while (this._needsCheck.length) {
    const end = this._needsCheck.pop()
    const start = this._needsCheck.pop()
    this._maybeCollides(start, end)
  }

  this._next(callback)
}

Diff.prototype._next = function (cb) {
  if (this._pending) {
    this._callback = cb
    return
  }

  if (this._error) return cb(this._error)

  while (this._stack.length) {
    const {i, left, right, skip} = this._stack.pop()

    if (skip || seq(left) === seq(right)) continue

    const doneLeft = done(left, i)
    const doneRight = done(right, i)

    if (doneLeft && doneRight) return call(cb, left, right)

    if (!right && left && this._skipRightNull) continue
    if (right && !left && this._skipLeftNull) continue

    const leftVal = left ? left.path(i) : 5
    const rightVal = right ? right.path(i) : 6
    const leftBucket = trie(left, i)
    const rightBucket = trie(right, i)

    for (var j = 0; j < 5; j++) {
      const leftSeq = leftVal === j ? left.seq : 0
      const rightSeq = rightVal === j ? right.seq : 0
      const len = this._stack.length
      var leftLen = this._stack.length
      var rightLen = this._stack.length
      var val

      if (leftSeq !== rightSeq) {
        if (!doneLeft && leftSeq && notInBucket(j, leftSeq, rightBucket)) {
          set(this._pushStack(leftLen++, i + 1), true, left)
        }
        if (!doneRight && rightSeq && notInBucket(j, rightSeq, leftBucket)) {
          set(this._pushStack(rightLen++, i + 1), false, right)
        }
      }

      if (!doneLeft) {
        const pushLeft = !this._skipRightNull || rightBucket[j]
        for (val = j; val < leftBucket.length; val += 5) {
          const seq = leftBucket[val]
          if (!seq) break
          if (seq !== rightSeq && notInBucket(j, seq, rightBucket)) {
            const top = this._pushStack(leftLen++, i + 1)
            if (pushLeft || top.right) this._getNode(seq, top, true)
            else top.skip = true
          }
        }
      }

      if (!doneRight) {
        const pushRight = !this._skipLeftNull || leftBucket[j]
        for (val = j; val < rightBucket.length; val += 5) {
          const seq = rightBucket[val]
          if (!seq) break
          if (seq !== leftSeq && notInBucket(j, seq, leftBucket)) {
            const top = this._pushStack(rightLen++, i + 1)
            if (pushRight || top.left) this._getNode(seq, top, false)
            else top.skip = true
          }
        }
      }

      if (Node.terminator(i) && this._stack.length > len) {
        if (!this._pending) this._maybeCollides(len, this._stack.length)
        else this._needsCheck.push(len, this._stack.length)
      }
    }

    if (doneLeft) return call(cb, left, null)
    if (doneRight) return call(cb, null, right)

    if (!this._pending) continue
    this._callback = cb
    return
  }

  cb(null, null)
}

Diff.prototype._maybeCollides = function (start, end) {
  // all nodes, start -> end, share the same hash
  // we need to check that there are no collisions

  // much simpler and *much* more likely - only one node
  if (end - start === 1) {
    const top = this._stack[start]
    if (collides(top)) {
      this._stack.push({i: top.i, left: null, right: top.right, skip: top.skip})
      top.right = null
    }
    return
  }

  // very unlikely, but multiple collisions or a trie reordering
  // due to a collision being deleted

  for (var i = start; i < end; i++) {
    const top = this._stack[i]
    if (collides(top) || !top.left) {
      const right = top.right
      for (var j = start; j < end; j++) {
        const other = this._stack[j]
        if (other.left && !other.left.collides(right)) {
          top.right = other.right
          other.right = right
          i-- // revisit top again, as it might still collide
          break
        }
      }
      if (top.right === right && top.left) {
        this._stack.push({i: top.i, left: null, right, skip: top.skip})
        top.right = null
      }
    }
  }
}

Diff.prototype._pushStack = function (len, i) {
  if (this._stack.length === len) this._stack.push({i, left: null, right: null, skip: false})
  return this._stack[len]
}

Diff.prototype._getNode = function (seq, top, left) {
  const self = this
  this._pending++
  this._db.getBySeq(seq, onnode)

  function onnode (err, node) {
    if (self._onnode && node) self._onnode(node)
    if (node) set(top, left, node)
    else if (err) self._error = err
    if (!--self._pending) self._finalize()
  }
}

function notInBucket (val, seq, bucket) {
  for (; val < bucket.length; val += 5) {
    if (bucket[val] === seq) return false
  }
  return true
}

function set (top, left, node) {
  if (left) top.left = node
  else top.right = node
}

function call (cb, left, right) {
  cb(null, {
    key: left ? left.key : right.key,
    left: left && left.final(),
    right: right && right.final()
  })
}

function trie (node, i) {
  return (node && node.trie[i]) || []
}

function seq (node) {
  return node ? node.seq : 0
}

function done (node, i) {
  return !!node && i >= node.length
}

function collides (top) {
  if (!top.left || !top.right || !Node.terminator(top.i)) return false
  return top.left.collides(top.right, top.i)
}

}).call(this,require("buffer").Buffer)
},{"./node":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hypertrie/lib/node.js","buffer":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/buffer/index.js","inherits":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/inherits/inherits_browser.js","nanoiterator":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/nanoiterator/index.js","varint":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hypertrie/node_modules/varint/index.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hypertrie/lib/get.js":[function(require,module,exports){
const Node = require('./node')

module.exports = Get

function Get (db, key, opts, cb) {
  this._db = db
  this._node = new Node({key, flags: (opts && opts.hidden) ? Node.Flags.HIDDEN : 0}, 0, null)
  this._callback = cb
  this._prefix = !!(opts && opts.prefix)
  this._closest = !!(opts && opts.closest)
  this._length = this._node.length - (this._prefix ? 1 : 0)
  this._onnode = (opts && opts.onnode) || null
  this._options = opts ? { wait: opts.wait, timeout: opts.timeout } : null

  this._start()
}

Get.prototype._start = function () {
  const self = this
  this._db.head(onhead)

  function onhead (err, head) {
    if (err) return self._callback(err, null)
    self._update(0, head)
  }
}

Get.prototype._update = function (i, head) {
  if (!head) return this._callback(null, null)

  if (this._onnode) this._onnode(head)
  const node = this._node

  for (; i < this._length; i++) {
    const val = node.path(i)
    const checkCollision = Node.terminator(i)

    if (head.path(i) === val) {
      if (!checkCollision || !node.collides(head, i)) continue
    }

    const bucket = head.trie[i] || []

    if (checkCollision) return this._updateHeadCollides(i, bucket, val)

    const seq = bucket[val]
    if (!seq) return this._callback(null, this._closest ? head.final() : null)

    return this._updateHead(i, seq)
  }

  this._callback(null, head.final())
}

Get.prototype._updateHeadCollides = function (i, bucket, val) {
  const self = this
  var missing = 1
  var error = null
  var node = null

  for (var j = val; j < bucket.length; j += 5) {
    const seq = bucket[j]
    if (!seq) break
    missing++
    this._db.getBySeq(seq, this._options, onnode)
  }

  onnode(null, null)

  function onnode (err, n) {
    if (err) error = err
    else if (n && !n.collides(self._node, i)) node = n
    if (--missing) return

    if (!node || error) return self._callback(error, this._closest ? this._node : null)
    self._update(i + 1, node)
  }
}

Get.prototype._updateHead = function (i, seq) {
  const self = this
  this._db.getBySeq(seq, this._options, onnode)

  function onnode (err, node) {
    if (err) return self._callback(err, null)
    self._update(i + 1, node)
  }
}

},{"./node":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hypertrie/lib/node.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hypertrie/lib/history.js":[function(require,module,exports){
const Nanoiterator = require('nanoiterator')
const inherits = require('inherits')

module.exports = History

function History (db, opts) {
  if (!opts) opts = {}
  if (typeof opts.gt === 'number') opts.gte = opts.gt + 1
  if (typeof opts.lt === 'number') opts.lte = opts.lt - 1

  Nanoiterator.call(this)

  this._gte = ifNumber(opts.gte, 1)
  this._lte = ifNumber(opts.lte, -1)
  this._reverse = !!(opts && opts.reverse)
  this._db = db
  this._live = !!(opts && opts.live)
}

inherits(History, Nanoiterator)

History.prototype._open = function (cb) {
  const self = this

  if (this._live && !this._reverse) {
    this._lte = Infinity
    return cb(null)
  }

  this._db.head(onhead)

  function onhead (err, head) {
    if (err) return cb(err)
    const headSeq = head ? head.seq : -1
    self._lte = self._lte === -1 ? headSeq : Math.min(self._lte, headSeq)
    cb(null)
  }
}

History.prototype._next = function (cb) {
  if (this._gte > this._lte) return cb(null, null)
  this._db.getBySeq(this._reverse ? this._lte-- : this._gte++, done)

  function done (err, node) {
    if (err) return cb(err)
    cb(null, node.final())
  }
}

function ifNumber (n, def) {
  return typeof n === 'number' ? n : def
}

},{"inherits":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/inherits/inherits_browser.js","nanoiterator":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/nanoiterator/index.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hypertrie/lib/iterator.js":[function(require,module,exports){
const Nanoiterator = require('nanoiterator')
const inherits = require('inherits')
const Node = require('./node')

const SORT_ORDER = [4, 0, 1, 2, 3].reverse()
const REVERSE_SORT_ORDER = SORT_ORDER.slice(0).reverse()

module.exports = Iterator

function Iterator (db, prefix, opts) {
  Nanoiterator.call(this)

  this._prefix = Node.normalizeKey(prefix || '')
  this._recursive = !opts || opts.recursive !== false
  this._order = (opts && opts.reverse) ? REVERSE_SORT_ORDER : SORT_ORDER
  this._random = !!(opts && opts.random)
  this._start = 0
  this._end = 0
  this._db = db
  this._stack = []
  this._callback = null
  this._pending = 0
  this._error = null
  this._gt = !!(opts && opts.gt)
  this._needsSort = []
  this._options = opts ? { wait: opts.wait, timeout: opts.timeout, hidden: !!opts.hidden } : null
}

inherits(Iterator, Nanoiterator)

Iterator.prototype._open = function (cb) {
  const self = this
  const opts = Object.assign({ prefix: true }, this._options)
  const prefix = this._db.get(this._prefix, opts, onnode)

  function onnode (err, node) {
    if (err) return cb(err)
    if (node) self._stack.push({i: prefix._length, node})
    self._start = prefix._length
    if (self._recursive) self._end = Infinity
    else self._end = prefix._length + 32
    cb(null)
  }
}

Iterator.prototype._next = function (cb) {
  var j

  while (this._stack.length) {
    const top = this._stack.pop()
    const len = Math.min(top.node.length, this._end)
    const i = top.i++

    if (i >= len) return cb(null, top.node.final())

    const bucket = top.node.trie[i] || []
    const order = this._random ? randomOrder() : this._order

    for (j = 0; j < order.length; j++) {
      var val = order[j]
      if (val !== 4 || !this._gt || i !== this._start) {
        const len = this._stack.length
        if (top.node.path(i) === val) this._stack.push(top)
        for (; val < bucket.length; val += 5) {
          const seq = bucket[val]
          if (seq) this._push(i + 1, seq)
        }
        if (this._stack.length - len > 1) {
          this._needsSort.push(len, this._stack.length)
        }
      }
    }

    if (!this._pending) continue
    this._callback = cb
    return
  }

  cb(null, null)
}

Iterator.prototype._push = function (i, seq) {
  const self = this
  const top = {i, node: null}

  this._pending++
  this._stack.push(top)
  this._db.getBySeq(seq, this._options, onnode)

  function onnode (err, node) {
    if (node) top.node = node
    else if (err) self._error = err
    if (!--self._pending) self._continue()
  }
}

Iterator.prototype._sort = function () {
  // only ran when there are potential collisions to make sure
  // the iterator sorts consistently
  while (this._needsSort.length) {
    const end = this._needsSort.pop()
    const start = this._needsSort.pop()
    sort(this._stack, start, end)
  }
}

Iterator.prototype._continue = function () {
  const callback = this._callback
  const err = this._error
  this._callback = this._error = null
  if (err) return callback(err)
  if (this._needsSort.length) this._sort()
  this._next(callback)
}

function sort (list, from, to) {
  // only ran on short lists so the simple o(n^2) algo is fine
  for (var i = from + 1; i < to; i++) {
    for (var j = i; j > from; j--) {
      const a = list[j]
      const b = list[j - 1]
      if (a.node.key <= b.node.key) break
      list[j] = b
      list[j - 1] = a
    }
  }
}

function randomOrder () {
  const order = [0, 1, 2, 3, 4]
  for (let i = 0; i < order.length - 1; i++) {
    const n = i + Math.floor(Math.random() * (order.length - i))
    const tmp = order[i]
    order[i] = order[n]
    order[n] = tmp
  }
  return order
}

},{"./node":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hypertrie/lib/node.js","inherits":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/inherits/inherits_browser.js","nanoiterator":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/nanoiterator/index.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hypertrie/lib/messages.js":[function(require,module,exports){
(function (Buffer){
// This file is auto generated by the protocol-buffers cli tool

/* eslint-disable quotes */
/* eslint-disable indent */
/* eslint-disable no-redeclare */
/* eslint-disable camelcase */

// Remember to `npm install --save protocol-buffers-encodings`
var encodings = require('protocol-buffers-encodings')
var varint = encodings.varint
var skip = encodings.skip

var Header = exports.Header = {
  buffer: true,
  encodingLength: null,
  encode: null,
  decode: null
}

var Node = exports.Node = {
  buffer: true,
  encodingLength: null,
  encode: null,
  decode: null
}

defineHeader()
defineNode()

function defineHeader () {
  var enc = [
    encodings.string,
    encodings.bytes
  ]

  Header.encodingLength = encodingLength
  Header.encode = encode
  Header.decode = decode

  function encodingLength (obj) {
    var length = 0
    if (!defined(obj.type)) throw new Error("type is required")
    var len = enc[0].encodingLength(obj.type)
    length += 1 + len
    if (defined(obj.metadata)) {
      var len = enc[1].encodingLength(obj.metadata)
      length += 1 + len
    }
    return length
  }

  function encode (obj, buf, offset) {
    if (!offset) offset = 0
    if (!buf) buf = Buffer.allocUnsafe(encodingLength(obj))
    var oldOffset = offset
    if (!defined(obj.type)) throw new Error("type is required")
    buf[offset++] = 10
    enc[0].encode(obj.type, buf, offset)
    offset += enc[0].encode.bytes
    if (defined(obj.metadata)) {
      buf[offset++] = 18
      enc[1].encode(obj.metadata, buf, offset)
      offset += enc[1].encode.bytes
    }
    encode.bytes = offset - oldOffset
    return buf
  }

  function decode (buf, offset, end) {
    if (!offset) offset = 0
    if (!end) end = buf.length
    if (!(end <= buf.length && offset <= buf.length)) throw new Error("Decoded message is not valid")
    var oldOffset = offset
    var obj = {
      type: "",
      metadata: null
    }
    var found0 = false
    while (true) {
      if (end <= offset) {
        if (!found0) throw new Error("Decoded message is not valid")
        decode.bytes = offset - oldOffset
        return obj
      }
      var prefix = varint.decode(buf, offset)
      offset += varint.decode.bytes
      var tag = prefix >> 3
      switch (tag) {
        case 1:
        obj.type = enc[0].decode(buf, offset)
        offset += enc[0].decode.bytes
        found0 = true
        break
        case 2:
        obj.metadata = enc[1].decode(buf, offset)
        offset += enc[1].decode.bytes
        break
        default:
        offset = skip(prefix & 7, buf, offset)
      }
    }
  }
}

function defineNode () {
  var enc = [
    encodings.string,
    encodings.bytes,
    encodings.varint
  ]

  Node.encodingLength = encodingLength
  Node.encode = encode
  Node.decode = decode

  function encodingLength (obj) {
    var length = 0
    if (!defined(obj.key)) throw new Error("key is required")
    var len = enc[0].encodingLength(obj.key)
    length += 1 + len
    if (defined(obj.valueBuffer)) {
      var len = enc[1].encodingLength(obj.valueBuffer)
      length += 1 + len
    }
    if (defined(obj.trieBuffer)) {
      var len = enc[1].encodingLength(obj.trieBuffer)
      length += 1 + len
    }
    if (defined(obj.seq)) {
      var len = enc[2].encodingLength(obj.seq)
      length += 1 + len
    }
    if (defined(obj.flags)) {
      var len = enc[2].encodingLength(obj.flags)
      length += 1 + len
    }
    return length
  }

  function encode (obj, buf, offset) {
    if (!offset) offset = 0
    if (!buf) buf = Buffer.allocUnsafe(encodingLength(obj))
    var oldOffset = offset
    if (!defined(obj.key)) throw new Error("key is required")
    buf[offset++] = 10
    enc[0].encode(obj.key, buf, offset)
    offset += enc[0].encode.bytes
    if (defined(obj.valueBuffer)) {
      buf[offset++] = 18
      enc[1].encode(obj.valueBuffer, buf, offset)
      offset += enc[1].encode.bytes
    }
    if (defined(obj.trieBuffer)) {
      buf[offset++] = 26
      enc[1].encode(obj.trieBuffer, buf, offset)
      offset += enc[1].encode.bytes
    }
    if (defined(obj.seq)) {
      buf[offset++] = 32
      enc[2].encode(obj.seq, buf, offset)
      offset += enc[2].encode.bytes
    }
    if (defined(obj.flags)) {
      buf[offset++] = 40
      enc[2].encode(obj.flags, buf, offset)
      offset += enc[2].encode.bytes
    }
    encode.bytes = offset - oldOffset
    return buf
  }

  function decode (buf, offset, end) {
    if (!offset) offset = 0
    if (!end) end = buf.length
    if (!(end <= buf.length && offset <= buf.length)) throw new Error("Decoded message is not valid")
    var oldOffset = offset
    var obj = {
      key: "",
      valueBuffer: null,
      trieBuffer: null,
      seq: 0,
      flags: 0
    }
    var found0 = false
    while (true) {
      if (end <= offset) {
        if (!found0) throw new Error("Decoded message is not valid")
        decode.bytes = offset - oldOffset
        return obj
      }
      var prefix = varint.decode(buf, offset)
      offset += varint.decode.bytes
      var tag = prefix >> 3
      switch (tag) {
        case 1:
        obj.key = enc[0].decode(buf, offset)
        offset += enc[0].decode.bytes
        found0 = true
        break
        case 2:
        obj.valueBuffer = enc[1].decode(buf, offset)
        offset += enc[1].decode.bytes
        break
        case 3:
        obj.trieBuffer = enc[1].decode(buf, offset)
        offset += enc[1].decode.bytes
        break
        case 4:
        obj.seq = enc[2].decode(buf, offset)
        offset += enc[2].decode.bytes
        break
        case 5:
        obj.flags = enc[2].decode(buf, offset)
        offset += enc[2].decode.bytes
        break
        default:
        offset = skip(prefix & 7, buf, offset)
      }
    }
  }
}

function defined (val) {
  return val !== null && val !== undefined && (typeof val !== 'number' || !isNaN(val))
}

}).call(this,require("buffer").Buffer)
},{"buffer":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/buffer/index.js","protocol-buffers-encodings":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/protocol-buffers-encodings/index.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hypertrie/lib/node.js":[function(require,module,exports){
(function (Buffer){
const sodium = require('sodium-universal')
const inspect = require('inspect-custom-symbol')
const messages = require('./messages')
const trie = require('./trie')

const KEY = Buffer.alloc(16)

module.exports = Node

const Flags = {
  HIDDEN: 1
}

function Node (data, seq, enc) {
  this.seq = seq || 0
  this.key = normalizeKey(data.key)
  this.value = data.value !== undefined ? data.value : null
  this.keySplit = split(this.key)
  this.flags = data.flags || 0
  this.hash = hash(this.keySplit)
  this.trie = data.trieBuffer ? trie.decode(data.trieBuffer) : (data.trie || [])
  this.trieBuffer = null
  this.valueBuffer = data.valueBuffer || null
  this.length = this.hash.length * 4 + 1 + 1
  this.valueEncoding = enc
}
Node.Flags = Flags

Node.prototype[inspect] = function (depth, opts) {
  return ((opts && opts.stylize) || defaultStylize)({seq: this.seq, key: this.key, value: this.value}, 'object')
}

Object.defineProperty(Node.prototype, 'hidden', {
  enumerable: true,
  get: function () {
    return !!(this.flags & Flags.HIDDEN)
  }
})

Node.prototype.path = function (i) {
  if (!i) return this.hidden ? 1 : 0
  i--
  const hash = this.hash
  const j = i >> 2
  if (j >= hash.length) return 4
  return (hash[j] >> (2 * (i & 3))) & 3
}

Node.prototype.final = function () {
  if (!this.valueBuffer || this.value !== null) return this
  this.value = this.valueEncoding ? this.valueEncoding.decode(this.valueBuffer) : this.valueBuffer

  // The flags are shifted in order to both hide the internal flags and support user-defined flags.
  this.flags = this.flags >> 8

  this.valueBuffer = null
  return this
}

Node.prototype.preencode = function () {
  if (!this.trieBuffer) this.trieBuffer = trie.encode(this.trie)
  if (!this.valueBuffer) this.valueBuffer = ((this.value !== null) && this.valueEncoding) ? this.valueEncoding.encode(this.value) : this.value
}

Node.prototype.encode = function () {
  this.preencode()
  return messages.Node.encode(this)
}

Node.prototype.collides = function (node, i) {
  if (!i) return false
  if (i === this.length - 1) return this.key !== node.key
  const j = Math.floor((i - 1) / 32)
  return this.keySplit[j] !== node.keySplit[j]
}

Node.decode = function (buf, seq, enc) {
  return new Node(messages.Node.decode(buf), seq, enc)
}

Node.terminator = function (i) {
  return i > 0 && (i & 31) === 0
}

Node.normalizeKey = normalizeKey

function hash (keys) {
  const buf = Buffer.allocUnsafe(8 * keys.length)

  for (var i = 0; i < keys.length; i++) {
    const key = Buffer.from(keys[i])
    sodium.crypto_shorthash(i ? buf.slice(i * 8) : buf, key, KEY)
  }

  return buf
}

function split (key) {
  const list = key.split('/')
  if (list[0] === '') list.shift()
  if (list[list.length - 1] === '') list.pop()
  return list
}

function normalizeKey (key) {
  if (!key.length) return ''
  return key[0] === '/' ? key.slice(1) : key
}

function defaultStylize (val) {
  return val
}

}).call(this,require("buffer").Buffer)
},{"./messages":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hypertrie/lib/messages.js","./trie":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hypertrie/lib/trie.js","buffer":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/buffer/index.js","inspect-custom-symbol":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/inspect-custom-symbol/browser.js","sodium-universal":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/sodium-universal/browser.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hypertrie/lib/put.js":[function(require,module,exports){
(function (process){
const Node = require('./node')

module.exports = Put

function putDefaultOptions (opts) {
  return Object.assign({}, {
    condition: null,
    closest: false,
    hidden: false,
    valueBuffer: null,
    flags: 0
  }, opts)
}

function Put (db, key, value, opts, cb) {
  let { hidden, condition, valueBuffer, flags, batch, del, closest } = putDefaultOptions(opts)

  this._db = db

  // The flags are shifted in order to both hide the internal flags and support user-defined flags.
  flags = (flags << 8) | (hidden ? Node.Flags.HIDDEN : 0)

  this._node = new Node({key, value, valueBuffer, flags}, 0, db.valueEncoding)
  this._callback = cb
  this._release = null
  this._batch = batch
  this._closest = closest
  this._condition = condition
  this._error = null
  this._pending = 0
  this._del = del
  this._finalized = false
  this._head = null

  if (this._batch) this._update(0, this._batch.head())
  else if (this._del) this._start()
  else this._lock()
}

Put.prototype._lock = function () {
  const self = this
  this._db._lock(function (release) {
    self._release = release
    self._start()
  })
}

Put.prototype._start = function () {
  const self = this
  this._db.head(onhead)

  function onhead (err, head) {
    if (err) return self._finalize(err)
    self._update(0, head)
  }
}

Put.prototype._finalize = function (err) {
  const self = this

  this._finalized = true
  if (this._pending) {
    if (err) this._error = err
    return
  }

  if (this._error) err = this._error
  if (err) return done(err)

  const closest = this._head
  if (this._head && this._head.key !== this._node.key) this._head = null
  if (this._condition) {
    const conditionNode = this._closest ? closest && closest.final() : this._head && this._head.final()
    this._condition(conditionNode, this._node, oncondition)
  } else insert()

  function oncondition (err, proceed) {
    if (err) return done(err)
    if (!proceed) return done(null)
    return insert()
  }

  function insert () {
    if (self._batch) {
      self._batch.append(self._node)
      return done(null, self._node)
    }

    self._node.seq = self._db.feed.length
    self._db.feed.append(self._node.encode(), done)
  }

  function done (err) {
    const node = err ? null : self._node
    if (self._release) self._release(self._callback, err, node)
    else self._callback(err, node)
  }
}

Put.prototype._push = function (i, val, seq) {
  if (seq !== this._del) push(this._node.trie, i, val, seq)
}

Put.prototype._pushCollidable = function (i, val, seq) {
  if (seq === this._del) return

  const self = this
  this._pending++
  this._get(seq, function (err, node) {
    if (err) this._error = err
    else if (node.collides(self._node, i)) push(self._node.trie, i, val, seq)
    if (!--self._pending && self._finalized) self._finalize(null)
  })
}

Put.prototype._update = function (i, head) {
  if (!head) return this._finalize(null)

  const node = this._node

  for (; i < node.length; i++) {
    // check for collision at the end (4) or if it's a prefix terminator
    const checkCollision = Node.terminator(i)
    const val = node.path(i)
    const bucket = head.trie[i] || []
    const headVal = head.path(i)
    for (var j = 0; j < bucket.length; j++) {
      // if same hash prefix, if no collision check is needed just continue
      if (j === val && !checkCollision) continue

      const seq = bucket[j]
      if (!seq) continue // skip no-ops

      if (!checkCollision) { // TODO: can prob optimise this with a || j !== val
        this._push(i, j, seq)
      } else {
        this._pushCollidable(i, j, seq)
      }
    }

    // we copied the head bucket, if this is still the closest node, continue
    // if no collision is possible
    if (headVal === val && (!checkCollision || !node.collides(head, i))) continue

    this._push(i, headVal, head.seq)

    if (checkCollision) return this._updateHeadCollidable(i, bucket, val)

    const seq = bucket[val]
    if (!seq) break
    return this._updateHead(i, seq)
  }

  this._head = head

  this._finalize(null)
}

Put.prototype._get = function (seq, cb) {
  const node = this._batch && this._batch.get(seq)
  if (node) return process.nextTick(cb, null, node)
  this._db.getBySeq(seq, cb)
}

Put.prototype._updateHeadCollidable = function (i, bucket, val) {
  const self = this
  var missing = 1
  var error = null
  var node = null

  for (var j = val; j < bucket.length; j += 5) {
    const seq = bucket[j]
    if (!seq) break
    missing++
    this._get(seq, onnode)
  }

  onnode(null, null)

  function onnode (err, n) {
    if (err) error = err
    else if (n && !n.collides(self._node, i)) node = n
    if (--missing) return

    if (!node) return self._finalize(error)
    self._update(i + 1, node)
  }
}

Put.prototype._updateHead = function (i, seq) {
  const self = this
  this._get(seq, onnode)

  function onnode (err, node) {
    if (err) return self._finalize(err)
    self._update(i + 1, node)
  }
}

function push (trie, i, val, seq) {
  while (val >= 5) val -= 5

  const bucket = trie[i] || (trie[i] = [])
  while (bucket.length > val && bucket[val]) val += 5

  if (bucket.indexOf(seq) === -1) bucket[val] = seq
}

}).call(this,require('_process'))
},{"./node":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hypertrie/lib/node.js","_process":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/process/browser.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hypertrie/lib/trie.js":[function(require,module,exports){
(function (Buffer){
const varint = require('varint')

exports.encode = function (trie) {
  const buf = Buffer.alloc(65536)
  var i, j
  var offset = 0

  varint.encode(trie.length, buf, offset)
  offset += varint.encode.bytes

  for (i = 0; i < trie.length; i++) {
    const bucket = trie[i]
    if (!bucket) continue

    var bit = 1
    var bitfield = 0

    varint.encode(i, buf, offset)
    offset += varint.encode.bytes

    for (j = 0; j < bucket.length; j++) {
      const seq = bucket[j]
      if (seq) bitfield |= bit
      bit *= 2
    }

    varint.encode(bitfield, buf, offset)
    offset += varint.encode.bytes

    for (j = 0; j < bucket.length; j++) {
      const seq = bucket[j]
      if (seq) {
        varint.encode(seq, buf, offset)
        offset += varint.encode.bytes
      }
    }
  }

  return buf.slice(0, offset)
}

exports.decode = function (buf) {
  var offset = 0

  const len = varint.decode(buf, offset)
  offset += varint.decode.bytes

  const trie = new Array(len)

  while (offset < buf.length) {
    const i = varint.decode(buf, offset)
    offset += varint.decode.bytes

    var bitfield = varint.decode(buf, offset)
    var pos = 0

    const bucket = trie[i] = new Array(32 - Math.clz32(bitfield))
    offset += varint.decode.bytes

    while (bitfield) {
      const bit = bitfield & 1

      if (bit) {
        bucket[pos] = varint.decode(buf, offset)
        offset += varint.decode.bytes
      }

      bitfield = (bitfield - bit) / 2
      pos++
    }
  }

  return trie
}

}).call(this,require("buffer").Buffer)
},{"buffer":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/buffer/index.js","varint":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hypertrie/node_modules/varint/index.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hypertrie/lib/watch.js":[function(require,module,exports){
const set = require('unordered-set')
const inherits = require('inherits')
const events = require('events')

module.exports = Watch

function Watch (db, prefix, onchange) {
  events.EventEmitter.call(this)

  this._db = db
  this._prefix = prefix
  this._destroyed = false
  this._closest = 0
  this._updated = false
  this._kicking = false
  this._index = 0

  if (onchange) this.on('change', onchange)
  set.add(this._db._watchers, this)
  this.update()
}

inherits(Watch, events.EventEmitter)

Watch.prototype.destroy = function () {
  set.remove(this._db._watchers, this)
  this._destroyed = true
}

Watch.prototype.update = function () {
  if (this._destroyed) return
  if (!this._kicking) this._kick()
  else this._updated = true
}

Watch.prototype._done = function (closest) {
  this._kicking = false

  if (closest > this._closest) {
    this._closest = closest
    this._updated = false
    this.emit('change')
    return
  }

  if (this._updated) {
    this._updated = false
    this._kick()
  }
}

Watch.prototype._kick = function () {
  const self = this
  this._kicking = true
  this._db.get(this._prefix, {prefix: true}, done)

  function done (_, node) {
    self._done(node ? node.seq : 0)
  }
}

},{"events":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/browserify/node_modules/events/events.js","inherits":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/inherits/inherits_browser.js","unordered-set":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/unordered-set/index.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hypertrie/node_modules/varint/decode.js":[function(require,module,exports){
arguments[4]["/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hypercore-protocol/node_modules/varint/decode.js"][0].apply(exports,arguments)
},{}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hypertrie/node_modules/varint/encode.js":[function(require,module,exports){
arguments[4]["/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hypercore-protocol/node_modules/varint/encode.js"][0].apply(exports,arguments)
},{}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hypertrie/node_modules/varint/index.js":[function(require,module,exports){
arguments[4]["/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hypercore-protocol/node_modules/varint/index.js"][0].apply(exports,arguments)
},{"./decode.js":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hypertrie/node_modules/varint/decode.js","./encode.js":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hypertrie/node_modules/varint/encode.js","./length.js":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hypertrie/node_modules/varint/length.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hypertrie/node_modules/varint/length.js":[function(require,module,exports){
arguments[4]["/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hypercore-protocol/node_modules/varint/length.js"][0].apply(exports,arguments)
},{}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hyperx/index.js":[function(require,module,exports){
var attrToProp = require('hyperscript-attribute-to-property')

var VAR = 0, TEXT = 1, OPEN = 2, CLOSE = 3, ATTR = 4
var ATTR_KEY = 5, ATTR_KEY_W = 6
var ATTR_VALUE_W = 7, ATTR_VALUE = 8
var ATTR_VALUE_SQ = 9, ATTR_VALUE_DQ = 10
var ATTR_EQ = 11, ATTR_BREAK = 12
var COMMENT = 13

module.exports = function (h, opts) {
  if (!opts) opts = {}
  var concat = opts.concat || function (a, b) {
    return String(a) + String(b)
  }
  if (opts.attrToProp !== false) {
    h = attrToProp(h)
  }

  return function (strings) {
    var state = TEXT, reg = ''
    var arglen = arguments.length
    var parts = []

    for (var i = 0; i < strings.length; i++) {
      if (i < arglen - 1) {
        var arg = arguments[i+1]
        var p = parse(strings[i])
        var xstate = state
        if (xstate === ATTR_VALUE_DQ) xstate = ATTR_VALUE
        if (xstate === ATTR_VALUE_SQ) xstate = ATTR_VALUE
        if (xstate === ATTR_VALUE_W) xstate = ATTR_VALUE
        if (xstate === ATTR) xstate = ATTR_KEY
        if (xstate === OPEN) {
          if (reg === '/') {
            p.push([ OPEN, '/', arg ])
            reg = ''
          } else {
            p.push([ OPEN, arg ])
          }
        } else if (xstate === COMMENT && opts.comments) {
          reg += String(arg)
        } else if (xstate !== COMMENT) {
          p.push([ VAR, xstate, arg ])
        }
        parts.push.apply(parts, p)
      } else parts.push.apply(parts, parse(strings[i]))
    }

    var tree = [null,{},[]]
    var stack = [[tree,-1]]
    for (var i = 0; i < parts.length; i++) {
      var cur = stack[stack.length-1][0]
      var p = parts[i], s = p[0]
      if (s === OPEN && /^\//.test(p[1])) {
        var ix = stack[stack.length-1][1]
        if (stack.length > 1) {
          stack.pop()
          stack[stack.length-1][0][2][ix] = h(
            cur[0], cur[1], cur[2].length ? cur[2] : undefined
          )
        }
      } else if (s === OPEN) {
        var c = [p[1],{},[]]
        cur[2].push(c)
        stack.push([c,cur[2].length-1])
      } else if (s === ATTR_KEY || (s === VAR && p[1] === ATTR_KEY)) {
        var key = ''
        var copyKey
        for (; i < parts.length; i++) {
          if (parts[i][0] === ATTR_KEY) {
            key = concat(key, parts[i][1])
          } else if (parts[i][0] === VAR && parts[i][1] === ATTR_KEY) {
            if (typeof parts[i][2] === 'object' && !key) {
              for (copyKey in parts[i][2]) {
                if (parts[i][2].hasOwnProperty(copyKey) && !cur[1][copyKey]) {
                  cur[1][copyKey] = parts[i][2][copyKey]
                }
              }
            } else {
              key = concat(key, parts[i][2])
            }
          } else break
        }
        if (parts[i][0] === ATTR_EQ) i++
        var j = i
        for (; i < parts.length; i++) {
          if (parts[i][0] === ATTR_VALUE || parts[i][0] === ATTR_KEY) {
            if (!cur[1][key]) cur[1][key] = strfn(parts[i][1])
            else parts[i][1]==="" || (cur[1][key] = concat(cur[1][key], parts[i][1]));
          } else if (parts[i][0] === VAR
          && (parts[i][1] === ATTR_VALUE || parts[i][1] === ATTR_KEY)) {
            if (!cur[1][key]) cur[1][key] = strfn(parts[i][2])
            else parts[i][2]==="" || (cur[1][key] = concat(cur[1][key], parts[i][2]));
          } else {
            if (key.length && !cur[1][key] && i === j
            && (parts[i][0] === CLOSE || parts[i][0] === ATTR_BREAK)) {
              // https://html.spec.whatwg.org/multipage/infrastructure.html#boolean-attributes
              // empty string is falsy, not well behaved value in browser
              cur[1][key] = key.toLowerCase()
            }
            if (parts[i][0] === CLOSE) {
              i--
            }
            break
          }
        }
      } else if (s === ATTR_KEY) {
        cur[1][p[1]] = true
      } else if (s === VAR && p[1] === ATTR_KEY) {
        cur[1][p[2]] = true
      } else if (s === CLOSE) {
        if (selfClosing(cur[0]) && stack.length) {
          var ix = stack[stack.length-1][1]
          stack.pop()
          stack[stack.length-1][0][2][ix] = h(
            cur[0], cur[1], cur[2].length ? cur[2] : undefined
          )
        }
      } else if (s === VAR && p[1] === TEXT) {
        if (p[2] === undefined || p[2] === null) p[2] = ''
        else if (!p[2]) p[2] = concat('', p[2])
        if (Array.isArray(p[2][0])) {
          cur[2].push.apply(cur[2], p[2])
        } else {
          cur[2].push(p[2])
        }
      } else if (s === TEXT) {
        cur[2].push(p[1])
      } else if (s === ATTR_EQ || s === ATTR_BREAK) {
        // no-op
      } else {
        throw new Error('unhandled: ' + s)
      }
    }

    if (tree[2].length > 1 && /^\s*$/.test(tree[2][0])) {
      tree[2].shift()
    }

    if (tree[2].length > 2
    || (tree[2].length === 2 && /\S/.test(tree[2][1]))) {
      if (opts.createFragment) return opts.createFragment(tree[2])
      throw new Error(
        'multiple root elements must be wrapped in an enclosing tag'
      )
    }
    if (Array.isArray(tree[2][0]) && typeof tree[2][0][0] === 'string'
    && Array.isArray(tree[2][0][2])) {
      tree[2][0] = h(tree[2][0][0], tree[2][0][1], tree[2][0][2])
    }
    return tree[2][0]

    function parse (str) {
      var res = []
      if (state === ATTR_VALUE_W) state = ATTR
      for (var i = 0; i < str.length; i++) {
        var c = str.charAt(i)
        if (state === TEXT && c === '<') {
          if (reg.length) res.push([TEXT, reg])
          reg = ''
          state = OPEN
        } else if (c === '>' && !quot(state) && state !== COMMENT) {
          if (state === OPEN && reg.length) {
            res.push([OPEN,reg])
          } else if (state === ATTR_KEY) {
            res.push([ATTR_KEY,reg])
          } else if (state === ATTR_VALUE && reg.length) {
            res.push([ATTR_VALUE,reg])
          }
          res.push([CLOSE])
          reg = ''
          state = TEXT
        } else if (state === COMMENT && /-$/.test(reg) && c === '-') {
          if (opts.comments) {
            res.push([ATTR_VALUE,reg.substr(0, reg.length - 1)])
          }
          reg = ''
          state = TEXT
        } else if (state === OPEN && /^!--$/.test(reg)) {
          if (opts.comments) {
            res.push([OPEN, reg],[ATTR_KEY,'comment'],[ATTR_EQ])
          }
          reg = c
          state = COMMENT
        } else if (state === TEXT || state === COMMENT) {
          reg += c
        } else if (state === OPEN && c === '/' && reg.length) {
          // no-op, self closing tag without a space <br/>
        } else if (state === OPEN && /\s/.test(c)) {
          if (reg.length) {
            res.push([OPEN, reg])
          }
          reg = ''
          state = ATTR
        } else if (state === OPEN) {
          reg += c
        } else if (state === ATTR && /[^\s"'=/]/.test(c)) {
          state = ATTR_KEY
          reg = c
        } else if (state === ATTR && /\s/.test(c)) {
          if (reg.length) res.push([ATTR_KEY,reg])
          res.push([ATTR_BREAK])
        } else if (state === ATTR_KEY && /\s/.test(c)) {
          res.push([ATTR_KEY,reg])
          reg = ''
          state = ATTR_KEY_W
        } else if (state === ATTR_KEY && c === '=') {
          res.push([ATTR_KEY,reg],[ATTR_EQ])
          reg = ''
          state = ATTR_VALUE_W
        } else if (state === ATTR_KEY) {
          reg += c
        } else if ((state === ATTR_KEY_W || state === ATTR) && c === '=') {
          res.push([ATTR_EQ])
          state = ATTR_VALUE_W
        } else if ((state === ATTR_KEY_W || state === ATTR) && !/\s/.test(c)) {
          res.push([ATTR_BREAK])
          if (/[\w-]/.test(c)) {
            reg += c
            state = ATTR_KEY
          } else state = ATTR
        } else if (state === ATTR_VALUE_W && c === '"') {
          state = ATTR_VALUE_DQ
        } else if (state === ATTR_VALUE_W && c === "'") {
          state = ATTR_VALUE_SQ
        } else if (state === ATTR_VALUE_DQ && c === '"') {
          res.push([ATTR_VALUE,reg],[ATTR_BREAK])
          reg = ''
          state = ATTR
        } else if (state === ATTR_VALUE_SQ && c === "'") {
          res.push([ATTR_VALUE,reg],[ATTR_BREAK])
          reg = ''
          state = ATTR
        } else if (state === ATTR_VALUE_W && !/\s/.test(c)) {
          state = ATTR_VALUE
          i--
        } else if (state === ATTR_VALUE && /\s/.test(c)) {
          res.push([ATTR_VALUE,reg],[ATTR_BREAK])
          reg = ''
          state = ATTR
        } else if (state === ATTR_VALUE || state === ATTR_VALUE_SQ
        || state === ATTR_VALUE_DQ) {
          reg += c
        }
      }
      if (state === TEXT && reg.length) {
        res.push([TEXT,reg])
        reg = ''
      } else if (state === ATTR_VALUE && reg.length) {
        res.push([ATTR_VALUE,reg])
        reg = ''
      } else if (state === ATTR_VALUE_DQ && reg.length) {
        res.push([ATTR_VALUE,reg])
        reg = ''
      } else if (state === ATTR_VALUE_SQ && reg.length) {
        res.push([ATTR_VALUE,reg])
        reg = ''
      } else if (state === ATTR_KEY) {
        res.push([ATTR_KEY,reg])
        reg = ''
      }
      return res
    }
  }

  function strfn (x) {
    if (typeof x === 'function') return x
    else if (typeof x === 'string') return x
    else if (x && typeof x === 'object') return x
    else if (x === null || x === undefined) return x
    else return concat('', x)
  }
}

function quot (state) {
  return state === ATTR_VALUE_SQ || state === ATTR_VALUE_DQ
}

var closeRE = RegExp('^(' + [
  'area', 'base', 'basefont', 'bgsound', 'br', 'col', 'command', 'embed',
  'frame', 'hr', 'img', 'input', 'isindex', 'keygen', 'link', 'meta', 'param',
  'source', 'track', 'wbr', '!--',
  // SVG TAGS
  'animate', 'animateTransform', 'circle', 'cursor', 'desc', 'ellipse',
  'feBlend', 'feColorMatrix', 'feComposite',
  'feConvolveMatrix', 'feDiffuseLighting', 'feDisplacementMap',
  'feDistantLight', 'feFlood', 'feFuncA', 'feFuncB', 'feFuncG', 'feFuncR',
  'feGaussianBlur', 'feImage', 'feMergeNode', 'feMorphology',
  'feOffset', 'fePointLight', 'feSpecularLighting', 'feSpotLight', 'feTile',
  'feTurbulence', 'font-face-format', 'font-face-name', 'font-face-uri',
  'glyph', 'glyphRef', 'hkern', 'image', 'line', 'missing-glyph', 'mpath',
  'path', 'polygon', 'polyline', 'rect', 'set', 'stop', 'tref', 'use', 'view',
  'vkern'
].join('|') + ')(?:[\.#][a-zA-Z0-9\u007F-\uFFFF_:-]+)*$')
function selfClosing (tag) { return closeRE.test(tag) }

},{"hyperscript-attribute-to-property":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hyperscript-attribute-to-property/index.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/ieee754/index.js":[function(require,module,exports){
exports.read = function (buffer, offset, isLE, mLen, nBytes) {
  var e, m
  var eLen = (nBytes * 8) - mLen - 1
  var eMax = (1 << eLen) - 1
  var eBias = eMax >> 1
  var nBits = -7
  var i = isLE ? (nBytes - 1) : 0
  var d = isLE ? -1 : 1
  var s = buffer[offset + i]

  i += d

  e = s & ((1 << (-nBits)) - 1)
  s >>= (-nBits)
  nBits += eLen
  for (; nBits > 0; e = (e * 256) + buffer[offset + i], i += d, nBits -= 8) {}

  m = e & ((1 << (-nBits)) - 1)
  e >>= (-nBits)
  nBits += mLen
  for (; nBits > 0; m = (m * 256) + buffer[offset + i], i += d, nBits -= 8) {}

  if (e === 0) {
    e = 1 - eBias
  } else if (e === eMax) {
    return m ? NaN : ((s ? -1 : 1) * Infinity)
  } else {
    m = m + Math.pow(2, mLen)
    e = e - eBias
  }
  return (s ? -1 : 1) * m * Math.pow(2, e - mLen)
}

exports.write = function (buffer, value, offset, isLE, mLen, nBytes) {
  var e, m, c
  var eLen = (nBytes * 8) - mLen - 1
  var eMax = (1 << eLen) - 1
  var eBias = eMax >> 1
  var rt = (mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0)
  var i = isLE ? 0 : (nBytes - 1)
  var d = isLE ? 1 : -1
  var s = value < 0 || (value === 0 && 1 / value < 0) ? 1 : 0

  value = Math.abs(value)

  if (isNaN(value) || value === Infinity) {
    m = isNaN(value) ? 1 : 0
    e = eMax
  } else {
    e = Math.floor(Math.log(value) / Math.LN2)
    if (value * (c = Math.pow(2, -e)) < 1) {
      e--
      c *= 2
    }
    if (e + eBias >= 1) {
      value += rt / c
    } else {
      value += rt * Math.pow(2, 1 - eBias)
    }
    if (value * c >= 2) {
      e++
      c /= 2
    }

    if (e + eBias >= eMax) {
      m = 0
      e = eMax
    } else if (e + eBias >= 1) {
      m = ((value * c) - 1) * Math.pow(2, mLen)
      e = e + eBias
    } else {
      m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen)
      e = 0
    }
  }

  for (; mLen >= 8; buffer[offset + i] = m & 0xff, i += d, m /= 256, mLen -= 8) {}

  e = (e << mLen) | m
  eLen += mLen
  for (; eLen > 0; buffer[offset + i] = e & 0xff, i += d, e /= 256, eLen -= 8) {}

  buffer[offset + i - d] |= s * 128
}

},{}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/inherits/inherits_browser.js":[function(require,module,exports){
if (typeof Object.create === 'function') {
  // implementation from standard node.js 'util' module
  module.exports = function inherits(ctor, superCtor) {
    if (superCtor) {
      ctor.super_ = superCtor
      ctor.prototype = Object.create(superCtor.prototype, {
        constructor: {
          value: ctor,
          enumerable: false,
          writable: true,
          configurable: true
        }
      })
    }
  };
} else {
  // old school shim for old browsers
  module.exports = function inherits(ctor, superCtor) {
    if (superCtor) {
      ctor.super_ = superCtor
      var TempCtor = function () {}
      TempCtor.prototype = superCtor.prototype
      ctor.prototype = new TempCtor()
      ctor.prototype.constructor = ctor
    }
  }
}

},{}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/insert-css/index.js":[function(require,module,exports){
var inserted = {};

module.exports = function (css, options) {
    if (inserted[css]) return;
    inserted[css] = true;
    
    var elem = document.createElement('style');
    elem.setAttribute('type', 'text/css');

    if ('textContent' in elem) {
      elem.textContent = css;
    } else {
      elem.styleSheet.cssText = css;
    }
    
    var head = document.getElementsByTagName('head')[0];
    if (options && options.prepend) {
        head.insertBefore(elem, head.childNodes[0]);
    } else {
        head.appendChild(elem);
    }
};

},{}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/inspect-custom-symbol/browser.js":[function(require,module,exports){
module.exports = Symbol.for('nodejs.util.inspect.custom')

},{}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/is-buffer/index.js":[function(require,module,exports){
/*!
 * Determine if an object is a Buffer
 *
 * @author   Feross Aboukhadijeh <https://feross.org>
 * @license  MIT
 */

// The _isBuffer check is for Safari 5-7 support, because it's missing
// Object.prototype.constructor. Remove this eventually
module.exports = function (obj) {
  return obj != null && (isBuffer(obj) || isSlowBuffer(obj) || !!obj._isBuffer)
}

function isBuffer (obj) {
  return !!obj.constructor && typeof obj.constructor.isBuffer === 'function' && obj.constructor.isBuffer(obj)
}

// For Node v0.10 support. Remove this eventually.
function isSlowBuffer (obj) {
  return typeof obj.readFloatLE === 'function' && typeof obj.slice === 'function' && isBuffer(obj.slice(0, 0))
}

},{}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/is-options/index.js":[function(require,module,exports){
(function (Buffer){
module.exports = isOptions

function isOptions (opts) {
  return typeof opts === 'object' && opts && !Buffer.isBuffer(opts)
}

}).call(this,{"isBuffer":require("../is-buffer/index.js")})
},{"../is-buffer/index.js":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/is-buffer/index.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/isarray/index.js":[function(require,module,exports){
var toString = {}.toString;

module.exports = Array.isArray || function (arr) {
  return toString.call(arr) == '[object Array]';
};

},{}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/last-one-wins/index.js":[function(require,module,exports){
module.exports = function (work) {
  var pending = null
  var callback = null
  var callbacks = null
  var next = null

  return function (val, cb) {
    next = val
    update(cb || noop)
  }

  function update (cb) {
    if (callback) {
      if (!pending) pending = []
      pending.push(cb)
      return
    }

    var val = next
    next = null
    callback = cb
    work(val, done)
  }

  function done (err) {
    var cb = callback
    var cbs = callbacks
    callbacks = null
    callback = null

    if (pending) {
      callbacks = pending
      pending = null
      update(noop)
    }

    if (cbs) {
      for (var i = 0; i < cbs.length; i++) cbs[i](err)
    }
    cb(err)
  }
}

function noop (_) {}

},{}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/memory-pager/index.js":[function(require,module,exports){
(function (Buffer){
module.exports = Pager

function Pager (pageSize, opts) {
  if (!(this instanceof Pager)) return new Pager(pageSize, opts)

  this.length = 0
  this.updates = []
  this.path = new Uint16Array(4)
  this.pages = new Array(32768)
  this.maxPages = this.pages.length
  this.level = 0
  this.pageSize = pageSize || 1024
  this.deduplicate = opts ? opts.deduplicate : null
  this.zeros = this.deduplicate ? alloc(this.deduplicate.length) : null
}

Pager.prototype.updated = function (page) {
  while (this.deduplicate && page.buffer[page.deduplicate] === this.deduplicate[page.deduplicate]) {
    page.deduplicate++
    if (page.deduplicate === this.deduplicate.length) {
      page.deduplicate = 0
      if (page.buffer.equals && page.buffer.equals(this.deduplicate)) page.buffer = this.deduplicate
      break
    }
  }
  if (page.updated || !this.updates) return
  page.updated = true
  this.updates.push(page)
}

Pager.prototype.lastUpdate = function () {
  if (!this.updates || !this.updates.length) return null
  var page = this.updates.pop()
  page.updated = false
  return page
}

Pager.prototype._array = function (i, noAllocate) {
  if (i >= this.maxPages) {
    if (noAllocate) return
    grow(this, i)
  }

  factor(i, this.path)

  var arr = this.pages

  for (var j = this.level; j > 0; j--) {
    var p = this.path[j]
    var next = arr[p]

    if (!next) {
      if (noAllocate) return
      next = arr[p] = new Array(32768)
    }

    arr = next
  }

  return arr
}

Pager.prototype.get = function (i, noAllocate) {
  var arr = this._array(i, noAllocate)
  var first = this.path[0]
  var page = arr && arr[first]

  if (!page && !noAllocate) {
    page = arr[first] = new Page(i, alloc(this.pageSize))
    if (i >= this.length) this.length = i + 1
  }

  if (page && page.buffer === this.deduplicate && this.deduplicate && !noAllocate) {
    page.buffer = copy(page.buffer)
    page.deduplicate = 0
  }

  return page
}

Pager.prototype.set = function (i, buf) {
  var arr = this._array(i, false)
  var first = this.path[0]

  if (i >= this.length) this.length = i + 1

  if (!buf || (this.zeros && buf.equals && buf.equals(this.zeros))) {
    arr[first] = undefined
    return
  }

  if (this.deduplicate && buf.equals && buf.equals(this.deduplicate)) {
    buf = this.deduplicate
  }

  var page = arr[first]
  var b = truncate(buf, this.pageSize)

  if (page) page.buffer = b
  else arr[first] = new Page(i, b)
}

Pager.prototype.toBuffer = function () {
  var list = new Array(this.length)
  var empty = alloc(this.pageSize)
  var ptr = 0

  while (ptr < list.length) {
    var arr = this._array(ptr, true)
    for (var i = 0; i < 32768 && ptr < list.length; i++) {
      list[ptr++] = (arr && arr[i]) ? arr[i].buffer : empty
    }
  }

  return Buffer.concat(list)
}

function grow (pager, index) {
  while (pager.maxPages < index) {
    var old = pager.pages
    pager.pages = new Array(32768)
    pager.pages[0] = old
    pager.level++
    pager.maxPages *= 32768
  }
}

function truncate (buf, len) {
  if (buf.length === len) return buf
  if (buf.length > len) return buf.slice(0, len)
  var cpy = alloc(len)
  buf.copy(cpy)
  return cpy
}

function alloc (size) {
  if (Buffer.alloc) return Buffer.alloc(size)
  var buf = new Buffer(size)
  buf.fill(0)
  return buf
}

function copy (buf) {
  var cpy = Buffer.allocUnsafe ? Buffer.allocUnsafe(buf.length) : new Buffer(buf.length)
  buf.copy(cpy)
  return cpy
}

function Page (i, buf) {
  this.offset = i * buf.length
  this.buffer = buf
  this.updated = false
  this.deduplicate = 0
}

function factor (n, out) {
  n = (n - (out[0] = (n & 32767))) / 32768
  n = (n - (out[1] = (n & 32767))) / 32768
  out[3] = ((n - (out[2] = (n & 32767))) / 32768) & 32767
}

}).call(this,require("buffer").Buffer)
},{"buffer":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/buffer/index.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/merkle-tree-stream/generator.js":[function(require,module,exports){
(function (Buffer){
// a more low level interface to the merkle tree stream.
// useful for certain applications the require non-streamy access to the algos.
// versioned by the same semver as the stream interface.

var flat = require('flat-tree')

module.exports = MerkleGenerator

function MerkleGenerator (opts, roots) {
  if (!(this instanceof MerkleGenerator)) return new MerkleGenerator(opts, roots)
  if (!opts || !opts.leaf || !opts.parent) throw new Error('opts.leaf and opts.parent required')

  this.roots = roots || opts.roots || []
  this.blocks = this.roots.length ? 1 + flat.rightSpan(this.roots[this.roots.length - 1].index) / 2 : 0

  for (var i = 0; i < this.roots.length; i++) {
    var r = this.roots[i]
    if (r && !r.parent) r.parent = flat.parent(r.index)
  }

  this._leaf = opts.leaf
  this._parent = opts.parent
}

MerkleGenerator.prototype.next = function (data, nodes) {
  if (!Buffer.isBuffer(data)) data = new Buffer(data)
  if (!nodes) nodes = []

  var index = 2 * this.blocks++

  var leaf = {
    index: index,
    parent: flat.parent(index),
    hash: null,
    size: data.length,
    data: data
  }

  leaf.hash = this._leaf(leaf, this.roots)
  this.roots.push(leaf)
  nodes.push(leaf)

  while (this.roots.length > 1) {
    var left = this.roots[this.roots.length - 2]
    var right = this.roots[this.roots.length - 1]

    if (left.parent !== right.parent) break

    this.roots.pop()
    this.roots[this.roots.length - 1] = leaf = {
      index: left.parent,
      parent: flat.parent(left.parent),
      hash: this._parent(left, right),
      size: left.size + right.size,
      data: null
    }
    nodes.push(leaf)
  }

  return nodes
}

}).call(this,require("buffer").Buffer)
},{"buffer":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/buffer/index.js","flat-tree":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/flat-tree/index.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/mutexify/index.js":[function(require,module,exports){
(function (process){
var mutexify = function() {
  var queue = []
  var used = null

  var call = function () {
    used(release)
  }

  var acquire = function (fn) {
    if (used) return queue.push(fn)
    used = fn
    acquire.locked = true
    process.nextTick(call)
    return 0
  }

  acquire.locked = false

  var release = function (fn, err, value) {
    used = null
    acquire.locked = false
    if (queue.length) acquire(queue.shift())
    if (fn) fn(err, value)
  }

  return acquire
}

module.exports = mutexify

}).call(this,require('_process'))
},{"_process":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/process/browser.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/nanoassert/index.js":[function(require,module,exports){
assert.notEqual = notEqual
assert.notOk = notOk
assert.equal = equal
assert.ok = assert

module.exports = assert

function equal (a, b, m) {
  assert(a == b, m) // eslint-disable-line eqeqeq
}

function notEqual (a, b, m) {
  assert(a != b, m) // eslint-disable-line eqeqeq
}

function notOk (t, m) {
  assert(!t, m)
}

function assert (t, m) {
  if (!t) throw new Error(m || 'AssertionError')
}

},{}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/nanoguard/index.js":[function(require,module,exports){
(function (process){
module.exports = class Nanoguard {
  constructor () {
    this._tick = 0
    this._fns = []
  }

  get waiting () {
    return this._tick > 0
  }

  wait () {
    this._tick++
  }

  continue (cb, err, val) {
    if (this._tick === 1) process.nextTick(continueNT, this)
    else this._tick--
    if (cb) cb(err, val)
  }

  waitAndContinue () {
    let once = false
    this.wait()
    return () => {
      if (once) return false
      once = true
      this.continue()
      return true
    }
  }

  continueSync (cb, err, val) {
    if (--this._tick) return
    while (this._fns !== null && this._fns.length) this._fns.pop()()
    if (cb) cb(err, val)
  }

  destroy () {
    const fns = this._fns
    if (fns) return
    this._fns = null
    while (fns.length) fns.pop()()
  }

  ready (fn) {
    if (this._fns === null || this._tick === 0) fn()
    else this._fns.push(fn)
  }
}

function continueNT (guard) {
  guard.continueSync()
}

}).call(this,require('_process'))
},{"_process":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/process/browser.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/nanoiterator/index.js":[function(require,module,exports){
(function (process){
module.exports = NanoIterator

function NanoIterator (opts) {
  if (!(this instanceof NanoIterator)) return new NanoIterator(opts)

  this.opened = false
  this.closed = false
  this.ended = false

  this._nextSync = false
  this._nextQueue = []
  this._nextCallback = null
  this._nextDone = nextDone.bind(null, this)
  this._openDone = openDone.bind(null, this)

  if (opts) {
    if (opts.open) this._open = opts.open
    if (opts.next) this._next = opts.next
    if (opts.destroy) this._destroy = opts.destroy
  }
}

NanoIterator.prototype.next = function (cb) {
  if (this._nextCallback || this._nextQueue.length) {
    this._nextQueue.push(cb)
    return
  }

  this._nextCallback = cb
  this._nextSync = true
  if (!this.opened) this._open(this._openDone)
  else update(this)
  this._nextSync = false
}

NanoIterator.prototype.destroy = function (cb) {
  if (!cb) cb = noop

  if (this.closed) {
    this.next(() => cb())
    return
  }

  this.closed = true
  if (!this._nextCallback) this.opened = true
  this.next(() => this._destroy(cb))
}

NanoIterator.prototype._open = function (cb) {
  cb(null)
}

NanoIterator.prototype._destroy = function (cb) {
  cb(null)
}

NanoIterator.prototype._next = function (cb) {
  cb(new Error('_next is not implemented'))
}

if (typeof Symbol !== 'undefined' && Symbol.asyncIterator) {
  NanoIterator.prototype[Symbol.asyncIterator] = function () {
    var self = this
    return {next: nextPromise}

    function nextPromise () {
      return new Promise(function (resolve, reject) {
        self.next(function (err, val) {
          if (err) return reject(err)
          resolve({value: val, done: val === null})
        })
      })
    }
  }
}

function noop () {}

function openDone (self, err) {
  if (err) return nextDone(self, err, null)
  self.opened = true
  update(self)
}

function nextDone (self, err, value) {
  if (self._nextSync) return nextDoneNT(self, err, value)

  if (self.closed) {
    err = new Error('Iterator is destroyed')
    value = null
  }

  var cb = self._nextCallback
  self._nextCallback = null
  if (!err && value === null) self.ended = true
  cb(err, value)

  if (self._nextCallback || !self._nextQueue.length) return

  self._nextCallback = self._nextQueue.shift()
  update(self)
}

function update (self) {
  if (self.ended || self.closed) nextDoneNT(self, null, null)
  else self._next(self._nextDone)
}

function nextDoneNT (self, err, val) {
  process.nextTick(nextDone, self, err, val)
}

}).call(this,require('_process'))
},{"_process":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/process/browser.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/nanoiterator/to-stream.js":[function(require,module,exports){
var stream = require('readable-stream')
var inherits = require('inherits')

module.exports = IteratorStream

function IteratorStream (ite) {
  if (!(this instanceof IteratorStream)) return new IteratorStream(ite)
  stream.Readable.call(this, {objectMode: true})

  this.iterator = ite
  this.onread = onread.bind(null, this)
  this.destroyed = false
}

inherits(IteratorStream, stream.Readable)

IteratorStream.prototype._read = function () {
  this.iterator.next(this.onread)
}

IteratorStream.prototype.destroy = function (err) {
  if (this.destroyed) return
  this.destroyed = true

  var self = this

  this.iterator.destroy(function (error) {
    if (!err) err = error
    if (err) self.emit('error', err)
    self.emit('close')
  })
}

function onread (self, err, value) {
  if (err) self.destroy(err)
  else self.push(value)
}

},{"inherits":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/inherits/inherits_browser.js","readable-stream":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/readable-stream/readable-browser.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/once/once.js":[function(require,module,exports){
var wrappy = require('wrappy')
module.exports = wrappy(once)
module.exports.strict = wrappy(onceStrict)

once.proto = once(function () {
  Object.defineProperty(Function.prototype, 'once', {
    value: function () {
      return once(this)
    },
    configurable: true
  })

  Object.defineProperty(Function.prototype, 'onceStrict', {
    value: function () {
      return onceStrict(this)
    },
    configurable: true
  })
})

function once (fn) {
  var f = function () {
    if (f.called) return f.value
    f.called = true
    return f.value = fn.apply(this, arguments)
  }
  f.called = false
  return f
}

function onceStrict (fn) {
  var f = function () {
    if (f.called)
      throw new Error(f.onceError)
    f.called = true
    return f.value = fn.apply(this, arguments)
  }
  var name = fn.name || 'Function wrapped with `once`'
  f.onceError = name + " shouldn't be called more than once"
  f.called = false
  return f
}

},{"wrappy":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/wrappy/wrappy.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/pretty-hash/index.js":[function(require,module,exports){
(function (Buffer){

module.exports = function prettyHash (buf) {
  if (Buffer.isBuffer(buf)) buf = buf.toString('hex')
  if (typeof buf === 'string' && buf.length > 8) {
    return buf.slice(0, 6) + '..' + buf.slice(-2)
  }
  return buf
}
}).call(this,{"isBuffer":require("../is-buffer/index.js")})
},{"../is-buffer/index.js":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/is-buffer/index.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/process-nextick-args/index.js":[function(require,module,exports){
(function (process){
'use strict';

if (typeof process === 'undefined' ||
    !process.version ||
    process.version.indexOf('v0.') === 0 ||
    process.version.indexOf('v1.') === 0 && process.version.indexOf('v1.8.') !== 0) {
  module.exports = { nextTick: nextTick };
} else {
  module.exports = process
}

function nextTick(fn, arg1, arg2, arg3) {
  if (typeof fn !== 'function') {
    throw new TypeError('"callback" argument must be a function');
  }
  var len = arguments.length;
  var args, i;
  switch (len) {
  case 0:
  case 1:
    return process.nextTick(fn);
  case 2:
    return process.nextTick(function afterTickOne() {
      fn.call(null, arg1);
    });
  case 3:
    return process.nextTick(function afterTickTwo() {
      fn.call(null, arg1, arg2);
    });
  case 4:
    return process.nextTick(function afterTickThree() {
      fn.call(null, arg1, arg2, arg3);
    });
  default:
    args = new Array(len - 1);
    i = 0;
    while (i < args.length) {
      args[i++] = arguments[i];
    }
    return process.nextTick(function afterTick() {
      fn.apply(null, args);
    });
  }
}


}).call(this,require('_process'))
},{"_process":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/process/browser.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/process/browser.js":[function(require,module,exports){
// shim for using process in browser
var process = module.exports = {};

// cached from whatever global is present so that test runners that stub it
// don't break things.  But we need to wrap it in a try catch in case it is
// wrapped in strict mode code which doesn't define any globals.  It's inside a
// function because try/catches deoptimize in certain engines.

var cachedSetTimeout;
var cachedClearTimeout;

function defaultSetTimout() {
    throw new Error('setTimeout has not been defined');
}
function defaultClearTimeout () {
    throw new Error('clearTimeout has not been defined');
}
(function () {
    try {
        if (typeof setTimeout === 'function') {
            cachedSetTimeout = setTimeout;
        } else {
            cachedSetTimeout = defaultSetTimout;
        }
    } catch (e) {
        cachedSetTimeout = defaultSetTimout;
    }
    try {
        if (typeof clearTimeout === 'function') {
            cachedClearTimeout = clearTimeout;
        } else {
            cachedClearTimeout = defaultClearTimeout;
        }
    } catch (e) {
        cachedClearTimeout = defaultClearTimeout;
    }
} ())
function runTimeout(fun) {
    if (cachedSetTimeout === setTimeout) {
        //normal enviroments in sane situations
        return setTimeout(fun, 0);
    }
    // if setTimeout wasn't available but was latter defined
    if ((cachedSetTimeout === defaultSetTimout || !cachedSetTimeout) && setTimeout) {
        cachedSetTimeout = setTimeout;
        return setTimeout(fun, 0);
    }
    try {
        // when when somebody has screwed with setTimeout but no I.E. maddness
        return cachedSetTimeout(fun, 0);
    } catch(e){
        try {
            // When we are in I.E. but the script has been evaled so I.E. doesn't trust the global object when called normally
            return cachedSetTimeout.call(null, fun, 0);
        } catch(e){
            // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error
            return cachedSetTimeout.call(this, fun, 0);
        }
    }


}
function runClearTimeout(marker) {
    if (cachedClearTimeout === clearTimeout) {
        //normal enviroments in sane situations
        return clearTimeout(marker);
    }
    // if clearTimeout wasn't available but was latter defined
    if ((cachedClearTimeout === defaultClearTimeout || !cachedClearTimeout) && clearTimeout) {
        cachedClearTimeout = clearTimeout;
        return clearTimeout(marker);
    }
    try {
        // when when somebody has screwed with setTimeout but no I.E. maddness
        return cachedClearTimeout(marker);
    } catch (e){
        try {
            // When we are in I.E. but the script has been evaled so I.E. doesn't  trust the global object when called normally
            return cachedClearTimeout.call(null, marker);
        } catch (e){
            // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error.
            // Some versions of I.E. have different rules for clearTimeout vs setTimeout
            return cachedClearTimeout.call(this, marker);
        }
    }



}
var queue = [];
var draining = false;
var currentQueue;
var queueIndex = -1;

function cleanUpNextTick() {
    if (!draining || !currentQueue) {
        return;
    }
    draining = false;
    if (currentQueue.length) {
        queue = currentQueue.concat(queue);
    } else {
        queueIndex = -1;
    }
    if (queue.length) {
        drainQueue();
    }
}

function drainQueue() {
    if (draining) {
        return;
    }
    var timeout = runTimeout(cleanUpNextTick);
    draining = true;

    var len = queue.length;
    while(len) {
        currentQueue = queue;
        queue = [];
        while (++queueIndex < len) {
            if (currentQueue) {
                currentQueue[queueIndex].run();
            }
        }
        queueIndex = -1;
        len = queue.length;
    }
    currentQueue = null;
    draining = false;
    runClearTimeout(timeout);
}

process.nextTick = function (fun) {
    var args = new Array(arguments.length - 1);
    if (arguments.length > 1) {
        for (var i = 1; i < arguments.length; i++) {
            args[i - 1] = arguments[i];
        }
    }
    queue.push(new Item(fun, args));
    if (queue.length === 1 && !draining) {
        runTimeout(drainQueue);
    }
};

// v8 likes predictible objects
function Item(fun, array) {
    this.fun = fun;
    this.array = array;
}
Item.prototype.run = function () {
    this.fun.apply(null, this.array);
};
process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];
process.version = ''; // empty string to avoid regexp issues
process.versions = {};

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;
process.prependListener = noop;
process.prependOnceListener = noop;

process.listeners = function (name) { return [] }

process.binding = function (name) {
    throw new Error('process.binding is not supported');
};

process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};
process.umask = function() { return 0; };

},{}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/protocol-buffers-encodings/index.js":[function(require,module,exports){
(function (Buffer){
var varint = require('varint')
var svarint = require('signed-varint')

exports.make = encoder

exports.name = function (enc) {
  var keys = Object.keys(exports)
  for (var i = 0; i < keys.length; i++) {
    if (exports[keys[i]] === enc) return keys[i]
  }
  return null
}

exports.skip = function (type, buffer, offset) {
  switch (type) {
    case 0:
      varint.decode(buffer, offset)
      return offset + varint.decode.bytes

    case 1:
      return offset + 8

    case 2:
      var len = varint.decode(buffer, offset)
      return offset + varint.decode.bytes + len

    case 3:
    case 4:
      throw new Error('Groups are not supported')

    case 5:
      return offset + 4
  }

  throw new Error('Unknown wire type: ' + type)
}

exports.bytes = encoder(2,
  function encode (val, buffer, offset) {
    var oldOffset = offset
    var len = bufferLength(val)

    varint.encode(len, buffer, offset)
    offset += varint.encode.bytes

    if (Buffer.isBuffer(val)) val.copy(buffer, offset)
    else buffer.write(val, offset, len)
    offset += len

    encode.bytes = offset - oldOffset
    return buffer
  },
  function decode (buffer, offset) {
    var oldOffset = offset

    var len = varint.decode(buffer, offset)
    offset += varint.decode.bytes

    var val = buffer.slice(offset, offset + len)
    offset += val.length

    decode.bytes = offset - oldOffset
    return val
  },
  function encodingLength (val) {
    var len = bufferLength(val)
    return varint.encodingLength(len) + len
  }
)

exports.string = encoder(2,
  function encode (val, buffer, offset) {
    var oldOffset = offset
    var len = Buffer.byteLength(val)

    varint.encode(len, buffer, offset, 'utf-8')
    offset += varint.encode.bytes

    buffer.write(val, offset, len)
    offset += len

    encode.bytes = offset - oldOffset
    return buffer
  },
  function decode (buffer, offset) {
    var oldOffset = offset

    var len = varint.decode(buffer, offset)
    offset += varint.decode.bytes

    var val = buffer.toString('utf-8', offset, offset + len)
    offset += len

    decode.bytes = offset - oldOffset
    return val
  },
  function encodingLength (val) {
    var len = Buffer.byteLength(val)
    return varint.encodingLength(len) + len
  }
)

exports.bool = encoder(0,
  function encode (val, buffer, offset) {
    buffer[offset] = val ? 1 : 0
    encode.bytes = 1
    return buffer
  },
  function decode (buffer, offset) {
    var bool = buffer[offset] > 0
    decode.bytes = 1
    return bool
  },
  function encodingLength () {
    return 1
  }
)

exports.int32 = encoder(0,
  function encode (val, buffer, offset) {
    varint.encode(val < 0 ? val + 4294967296 : val, buffer, offset)
    encode.bytes = varint.encode.bytes
    return buffer
  },
  function decode (buffer, offset) {
    var val = varint.decode(buffer, offset)
    decode.bytes = varint.decode.bytes
    return val > 2147483647 ? val - 4294967296 : val
  },
  function encodingLength (val) {
    return varint.encodingLength(val < 0 ? val + 4294967296 : val)
  }
)

exports.int64 = encoder(0,
  function encode (val, buffer, offset) {
    if (val < 0) {
      var last = offset + 9
      varint.encode(val * -1, buffer, offset)
      offset += varint.encode.bytes - 1
      buffer[offset] = buffer[offset] | 0x80
      while (offset < last - 1) {
        offset++
        buffer[offset] = 0xff
      }
      buffer[last] = 0x01
      encode.bytes = 10
    } else {
      varint.encode(val, buffer, offset)
      encode.bytes = varint.encode.bytes
    }
    return buffer
  },
  function decode (buffer, offset) {
    var val = varint.decode(buffer, offset)
    if (val >= Math.pow(2, 63)) {
      var limit = 9
      while (buffer[offset + limit - 1] === 0xff) limit--
      limit = limit || 9
      var subset = Buffer.allocUnsafe(limit)
      buffer.copy(subset, 0, offset, offset + limit)
      subset[limit - 1] = subset[limit - 1] & 0x7f
      val = -1 * varint.decode(subset, 0)
      decode.bytes = 10
    } else {
      decode.bytes = varint.decode.bytes
    }
    return val
  },
  function encodingLength (val) {
    return val < 0 ? 10 : varint.encodingLength(val)
  }
)

exports.sint32 =
exports.sint64 = encoder(0,
  svarint.encode,
  svarint.decode,
  svarint.encodingLength
)

exports.uint32 =
exports.uint64 =
exports.enum =
exports.varint = encoder(0,
  varint.encode,
  varint.decode,
  varint.encodingLength
)

// we cannot represent these in javascript so we just use buffers
exports.fixed64 =
exports.sfixed64 = encoder(1,
  function encode (val, buffer, offset) {
    val.copy(buffer, offset)
    encode.bytes = 8
    return buffer
  },
  function decode (buffer, offset) {
    var val = buffer.slice(offset, offset + 8)
    decode.bytes = 8
    return val
  },
  function encodingLength () {
    return 8
  }
)

exports.double = encoder(1,
  function encode (val, buffer, offset) {
    buffer.writeDoubleLE(val, offset)
    encode.bytes = 8
    return buffer
  },
  function decode (buffer, offset) {
    var val = buffer.readDoubleLE(offset)
    decode.bytes = 8
    return val
  },
  function encodingLength () {
    return 8
  }
)

exports.fixed32 = encoder(5,
  function encode (val, buffer, offset) {
    buffer.writeUInt32LE(val, offset)
    encode.bytes = 4
    return buffer
  },
  function decode (buffer, offset) {
    var val = buffer.readUInt32LE(offset)
    decode.bytes = 4
    return val
  },
  function encodingLength () {
    return 4
  }
)

exports.sfixed32 = encoder(5,
  function encode (val, buffer, offset) {
    buffer.writeInt32LE(val, offset)
    encode.bytes = 4
    return buffer
  },
  function decode (buffer, offset) {
    var val = buffer.readInt32LE(offset)
    decode.bytes = 4
    return val
  },
  function encodingLength () {
    return 4
  }
)

exports.float = encoder(5,
  function encode (val, buffer, offset) {
    buffer.writeFloatLE(val, offset)
    encode.bytes = 4
    return buffer
  },
  function decode (buffer, offset) {
    var val = buffer.readFloatLE(offset)
    decode.bytes = 4
    return val
  },
  function encodingLength () {
    return 4
  }
)

function encoder (type, encode, decode, encodingLength) {
  encode.bytes = decode.bytes = 0

  return {
    type: type,
    encode: encode,
    decode: decode,
    encodingLength: encodingLength
  }
}

function bufferLength (val) {
  return Buffer.isBuffer(val) ? val.length : Buffer.byteLength(val)
}

}).call(this,require("buffer").Buffer)
},{"buffer":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/buffer/index.js","signed-varint":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/signed-varint/index.js","varint":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/protocol-buffers-encodings/node_modules/varint/index.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/protocol-buffers-encodings/node_modules/varint/decode.js":[function(require,module,exports){
arguments[4]["/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hypercore-protocol/node_modules/varint/decode.js"][0].apply(exports,arguments)
},{}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/protocol-buffers-encodings/node_modules/varint/encode.js":[function(require,module,exports){
arguments[4]["/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hypercore-protocol/node_modules/varint/encode.js"][0].apply(exports,arguments)
},{}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/protocol-buffers-encodings/node_modules/varint/index.js":[function(require,module,exports){
arguments[4]["/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hypercore-protocol/node_modules/varint/index.js"][0].apply(exports,arguments)
},{"./decode.js":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/protocol-buffers-encodings/node_modules/varint/decode.js","./encode.js":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/protocol-buffers-encodings/node_modules/varint/encode.js","./length.js":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/protocol-buffers-encodings/node_modules/varint/length.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/protocol-buffers-encodings/node_modules/varint/length.js":[function(require,module,exports){
arguments[4]["/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hypercore-protocol/node_modules/varint/length.js"][0].apply(exports,arguments)
},{}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/pump/index.js":[function(require,module,exports){
(function (process){
var once = require('once')
var eos = require('end-of-stream')
var fs = require('fs') // we only need fs to get the ReadStream and WriteStream prototypes

var noop = function () {}
var ancient = /^v?\.0/.test(process.version)

var isFn = function (fn) {
  return typeof fn === 'function'
}

var isFS = function (stream) {
  if (!ancient) return false // newer node version do not need to care about fs is a special way
  if (!fs) return false // browser
  return (stream instanceof (fs.ReadStream || noop) || stream instanceof (fs.WriteStream || noop)) && isFn(stream.close)
}

var isRequest = function (stream) {
  return stream.setHeader && isFn(stream.abort)
}

var destroyer = function (stream, reading, writing, callback) {
  callback = once(callback)

  var closed = false
  stream.on('close', function () {
    closed = true
  })

  eos(stream, {readable: reading, writable: writing}, function (err) {
    if (err) return callback(err)
    closed = true
    callback()
  })

  var destroyed = false
  return function (err) {
    if (closed) return
    if (destroyed) return
    destroyed = true

    if (isFS(stream)) return stream.close(noop) // use close for fs streams to avoid fd leaks
    if (isRequest(stream)) return stream.abort() // request.destroy just do .end - .abort is what we want

    if (isFn(stream.destroy)) return stream.destroy()

    callback(err || new Error('stream was destroyed'))
  }
}

var call = function (fn) {
  fn()
}

var pipe = function (from, to) {
  return from.pipe(to)
}

var pump = function () {
  var streams = Array.prototype.slice.call(arguments)
  var callback = isFn(streams[streams.length - 1] || noop) && streams.pop() || noop

  if (Array.isArray(streams[0])) streams = streams[0]
  if (streams.length < 2) throw new Error('pump requires two streams per minimum')

  var error
  var destroys = streams.map(function (stream, i) {
    var reading = i < streams.length - 1
    var writing = i > 0
    return destroyer(stream, reading, writing, function (err) {
      if (!error) error = err
      if (err) destroys.forEach(call)
      if (reading) return
      destroys.forEach(call)
      callback(error)
    })
  })

  return streams.reduce(pipe)
}

module.exports = pump

}).call(this,require('_process'))
},{"_process":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/process/browser.js","end-of-stream":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/end-of-stream/index.js","fs":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/browser-resolve/empty.js","once":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/once/once.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/random-access-file/browser.js":[function(require,module,exports){
module.exports = function () {
  throw new Error('random-access-file is not supported in the browser')
}

},{}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/random-access-memory/index.js":[function(require,module,exports){
(function (process,Buffer){
const RandomAccess = require('random-access-storage')
const isOptions = require('is-options')
const inherits = require('inherits')

const DEFAULT_PAGE_SIZE = 1024 * 1024

module.exports = RAM

function RAM (opts) {
  if (!(this instanceof RAM)) return new RAM(opts)
  if (typeof opts === 'number') opts = {length: opts}
  if (!opts) opts = {}

  RandomAccess.call(this)

  if (Buffer.isBuffer(opts)) {
    opts = {length: opts.length, buffer: opts}
  }
  if (!isOptions(opts)) opts = {}

  this.length = opts.length || 0
  this.pageSize = opts.length || opts.pageSize || DEFAULT_PAGE_SIZE
  this.buffers = []

  if (opts.buffer) this.buffers.push(opts.buffer)
}

inherits(RAM, RandomAccess)

RAM.prototype._stat = function (req) {
  callback(req, null, {size: this.length})
}

RAM.prototype._write = function (req) {
  var i = Math.floor(req.offset / this.pageSize)
  var rel = req.offset - i * this.pageSize
  var start = 0

  const len = req.offset + req.size
  if (len > this.length) this.length = len

  while (start < req.size) {
    const page = this._page(i++, true)
    const free = this.pageSize - rel
    const end = free < (req.size - start)
      ? start + free
      : req.size

    req.data.copy(page, rel, start, end)
    start = end
    rel = 0
  }

  callback(req, null, null)
}

RAM.prototype._read = function (req) {
  var i = Math.floor(req.offset / this.pageSize)
  var rel = req.offset - i * this.pageSize
  var start = 0

  if (req.offset + req.size > this.length) {
    return callback(req, new Error('Could not satisfy length'), null)
  }

  const data = Buffer.alloc(req.size)

  while (start < req.size) {
    const page = this._page(i++, false)
    const avail = this.pageSize - rel
    const wanted = req.size - start
    const len = avail < wanted ? avail : wanted

    if (page) page.copy(data, start, rel, rel + len)
    start += len
    rel = 0
  }

  callback(req, null, data)
}

RAM.prototype._del = function (req) {
  var i = Math.floor(req.offset / this.pageSize)
  var rel = req.offset - i * this.pageSize
  var start = 0

  if (req.offset + req.size > this.length) {
    req.size = Math.max(0, this.length - req.offset)
  }

  while (start < req.size) {
    if (rel === 0 && req.size - start >= this.pageSize) {
      this.buffers[i++] = undefined
    }

    rel = 0
    start += this.pageSize - rel
  }

  if (req.offset + req.size >= this.length) {
    this.length = req.offset
  }

  callback(req, null, null)
}

RAM.prototype._destroy = function (req) {
  this._buffers = []
  this.length = 0
  callback(req, null, null)
}

RAM.prototype._page = function (i, upsert) {
  var page = this.buffers[i]
  if (page || !upsert) return page
  page = this.buffers[i] = Buffer.alloc(this.pageSize)
  return page
}

RAM.prototype.toBuffer = function () {
  const buf = Buffer.alloc(this.length)

  for (var i = 0; i < this.buffers.length; i++) {
    if (this.buffers[i]) this.buffers[i].copy(buf, i * this.pageSize)
  }

  return buf
}

function callback (req, err, data) {
  process.nextTick(callbackNT, req, err, data)
}

function callbackNT (req, err, data) {
  req.callback(err, data)
}

}).call(this,require('_process'),require("buffer").Buffer)
},{"_process":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/process/browser.js","buffer":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/buffer/index.js","inherits":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/inherits/inherits_browser.js","is-options":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/is-options/index.js","random-access-storage":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/random-access-storage/index.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/random-access-storage/index.js":[function(require,module,exports){
(function (process){
var events = require('events')
var inherits = require('inherits')

var NOT_READABLE = defaultImpl(new Error('Not readable'))
var NOT_WRITABLE = defaultImpl(new Error('Not writable'))
var NOT_DELETABLE = defaultImpl(new Error('Not deletable'))
var NOT_STATABLE = defaultImpl(new Error('Not statable'))
var NO_OPEN_READABLE = defaultImpl(new Error('No readonly open'))

module.exports = RandomAccess

function RandomAccess (opts) {
  if (!(this instanceof RandomAccess)) return new RandomAccess(opts)
  events.EventEmitter.call(this)

  this._queued = []
  this._pending = 0
  this._needsOpen = true

  this.opened = false
  this.closed = false
  this.destroyed = false

  if (opts) {
    if (opts.openReadonly) this._openReadonly = opts.openReadonly
    if (opts.open) this._open = opts.open
    if (opts.read) this._read = opts.read
    if (opts.write) this._write = opts.write
    if (opts.del) this._del = opts.del
    if (opts.stat) this._stat = opts.stat
    if (opts.close) this._close = opts.close
    if (opts.destroy) this._destroy = opts.destroy
  }

  this.preferReadonly = this._openReadonly !== NO_OPEN_READABLE
  this.readable = this._read !== NOT_READABLE
  this.writable = this._write !== NOT_WRITABLE
  this.deletable = this._del !== NOT_DELETABLE
  this.statable = this._stat !== NOT_STATABLE
}

inherits(RandomAccess, events.EventEmitter)

RandomAccess.prototype.read = function (offset, size, cb) {
  this.run(new Request(this, 0, offset, size, null, cb))
}

RandomAccess.prototype._read = NOT_READABLE

RandomAccess.prototype.write = function (offset, data, cb) {
  if (!cb) cb = noop
  openWritable(this)
  this.run(new Request(this, 1, offset, data.length, data, cb))
}

RandomAccess.prototype._write = NOT_WRITABLE

RandomAccess.prototype.del = function (offset, size, cb) {
  if (!cb) cb = noop
  openWritable(this)
  this.run(new Request(this, 2, offset, size, null, cb))
}

RandomAccess.prototype._del = NOT_DELETABLE

RandomAccess.prototype.stat = function (cb) {
  this.run(new Request(this, 3, 0, 0, null, cb))
}

RandomAccess.prototype._stat = NOT_STATABLE

RandomAccess.prototype.open = function (cb) {
  if (!cb) cb = noop
  if (this.opened && !this._needsOpen) return process.nextTick(cb, null)
  queueAndRun(this, new Request(this, 4, 0, 0, null, cb))
}

RandomAccess.prototype._open = defaultImpl(null)
RandomAccess.prototype._openReadonly = NO_OPEN_READABLE

RandomAccess.prototype.close = function (cb) {
  if (!cb) cb = noop
  if (this.closed) return process.nextTick(cb, null)
  queueAndRun(this, new Request(this, 5, 0, 0, null, cb))
}

RandomAccess.prototype._close = defaultImpl(null)

RandomAccess.prototype.destroy = function (cb) {
  if (!cb) cb = noop
  if (!this.closed) this.close(noop)
  queueAndRun(this, new Request(this, 6, 0, 0, null, cb))
}

RandomAccess.prototype._destroy = defaultImpl(null)

RandomAccess.prototype.run = function (req) {
  if (this._needsOpen) this.open(noop)
  if (this._queued.length) this._queued.push(req)
  else req._run()
}

function noop () {}

function Request (self, type, offset, size, data, cb) {
  this.type = type
  this.offset = offset
  this.data = data
  this.size = size
  this.storage = self

  this._sync = false
  this._callback = cb
  this._openError = null
}

Request.prototype._maybeOpenError = function (err) {
  if (this.type !== 4) return
  var queued = this.storage._queued
  for (var i = 0; i < queued.length; i++) queued[i]._openError = err
}

Request.prototype._unqueue = function (err) {
  var ra = this.storage
  var queued = ra._queued

  if (!err) {
    switch (this.type) {
      case 4:
        if (!ra.opened) {
          ra.opened = true
          ra.emit('open')
        }
        break

      case 5:
        if (!ra.closed) {
          ra.closed = true
          ra.emit('close')
        }
        break

      case 6:
        if (!ra.destroyed) {
          ra.destroyed = true
          ra.emit('destroy')
        }
        break
    }
  } else {
    this._maybeOpenError(err)
  }

  if (queued.length && queued[0] === this) queued.shift()

  if (!--ra._pending) drainQueue(ra)
}

Request.prototype.callback = function (err, val) {
  if (this._sync) return nextTick(this, err, val)
  this._unqueue(err)
  this._callback(err, val)
}

Request.prototype._openAndNotClosed = function () {
  var ra = this.storage
  if (ra.opened && !ra.closed) return true
  if (!ra.opened) nextTick(this, this._openError || new Error('Not opened'))
  else if (ra.closed) nextTick(this, new Error('Closed'))
  return false
}

Request.prototype._open = function () {
  var ra = this.storage

  if (ra.opened && !ra._needsOpen) return nextTick(this, null)
  if (ra.closed) return nextTick(this, new Error('Closed'))

  ra._needsOpen = false
  if (ra.preferReadonly) ra._openReadonly(this)
  else ra._open(this)
}

Request.prototype._run = function () {
  var ra = this.storage
  ra._pending++

  this._sync = true

  switch (this.type) {
    case 0:
      if (this._openAndNotClosed()) ra._read(this)
      break

    case 1:
      if (this._openAndNotClosed()) ra._write(this)
      break

    case 2:
      if (this._openAndNotClosed()) ra._del(this)
      break

    case 3:
      if (this._openAndNotClosed()) ra._stat(this)
      break

    case 4:
      this._open()
      break

    case 5:
      if (ra.closed || !ra.opened) nextTick(this, null)
      else ra._close(this)
      break

    case 6:
      if (ra.destroyed) nextTick(this, null)
      else ra._destroy(this)
      break
  }

  this._sync = false
}

function queueAndRun (self, req) {
  self._queued.push(req)
  if (!self._pending) req._run()
}

function drainQueue (self) {
  var queued = self._queued

  while (queued.length > 0) {
    queued[0]._run()
    if (queued[0].type > 3) return // all >3 types are blocking
    queued.shift()
  }
}

function openWritable (self) {
  if (self.preferReadonly) {
    self._needsOpen = true
    self.preferReadonly = false
  }
}

function defaultImpl (err) {
  return overridable

  function overridable (req) {
    nextTick(req, err)
  }
}

function nextTick (req, err, val) {
  process.nextTick(nextTickCallback, req, err, val)
}

function nextTickCallback (req, err, val) {
  req.callback(err, val)
}

}).call(this,require('_process'))
},{"_process":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/process/browser.js","events":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/browserify/node_modules/events/events.js","inherits":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/inherits/inherits_browser.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/readable-stream/duplex-browser.js":[function(require,module,exports){
module.exports = require('./lib/_stream_duplex.js');

},{"./lib/_stream_duplex.js":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/readable-stream/lib/_stream_duplex.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/readable-stream/lib/_stream_duplex.js":[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// a duplex stream is just a stream that is both readable and writable.
// Since JS doesn't have multiple prototypal inheritance, this class
// prototypally inherits from Readable, and then parasitically from
// Writable.

'use strict';

/*<replacement>*/

var pna = require('process-nextick-args');
/*</replacement>*/

/*<replacement>*/
var objectKeys = Object.keys || function (obj) {
  var keys = [];
  for (var key in obj) {
    keys.push(key);
  }return keys;
};
/*</replacement>*/

module.exports = Duplex;

/*<replacement>*/
var util = require('core-util-is');
util.inherits = require('inherits');
/*</replacement>*/

var Readable = require('./_stream_readable');
var Writable = require('./_stream_writable');

util.inherits(Duplex, Readable);

{
  // avoid scope creep, the keys array can then be collected
  var keys = objectKeys(Writable.prototype);
  for (var v = 0; v < keys.length; v++) {
    var method = keys[v];
    if (!Duplex.prototype[method]) Duplex.prototype[method] = Writable.prototype[method];
  }
}

function Duplex(options) {
  if (!(this instanceof Duplex)) return new Duplex(options);

  Readable.call(this, options);
  Writable.call(this, options);

  if (options && options.readable === false) this.readable = false;

  if (options && options.writable === false) this.writable = false;

  this.allowHalfOpen = true;
  if (options && options.allowHalfOpen === false) this.allowHalfOpen = false;

  this.once('end', onend);
}

Object.defineProperty(Duplex.prototype, 'writableHighWaterMark', {
  // making it explicit this property is not enumerable
  // because otherwise some prototype manipulation in
  // userland will fail
  enumerable: false,
  get: function () {
    return this._writableState.highWaterMark;
  }
});

// the no-half-open enforcer
function onend() {
  // if we allow half-open state, or if the writable side ended,
  // then we're ok.
  if (this.allowHalfOpen || this._writableState.ended) return;

  // no more data can be written.
  // But allow more writes to happen in this tick.
  pna.nextTick(onEndNT, this);
}

function onEndNT(self) {
  self.end();
}

Object.defineProperty(Duplex.prototype, 'destroyed', {
  get: function () {
    if (this._readableState === undefined || this._writableState === undefined) {
      return false;
    }
    return this._readableState.destroyed && this._writableState.destroyed;
  },
  set: function (value) {
    // we ignore the value if the stream
    // has not been initialized yet
    if (this._readableState === undefined || this._writableState === undefined) {
      return;
    }

    // backward compatibility, the user is explicitly
    // managing destroyed
    this._readableState.destroyed = value;
    this._writableState.destroyed = value;
  }
});

Duplex.prototype._destroy = function (err, cb) {
  this.push(null);
  this.end();

  pna.nextTick(cb, err);
};
},{"./_stream_readable":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/readable-stream/lib/_stream_readable.js","./_stream_writable":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/readable-stream/lib/_stream_writable.js","core-util-is":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/core-util-is/lib/util.js","inherits":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/inherits/inherits_browser.js","process-nextick-args":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/process-nextick-args/index.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/readable-stream/lib/_stream_passthrough.js":[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// a passthrough stream.
// basically just the most minimal sort of Transform stream.
// Every written chunk gets output as-is.

'use strict';

module.exports = PassThrough;

var Transform = require('./_stream_transform');

/*<replacement>*/
var util = require('core-util-is');
util.inherits = require('inherits');
/*</replacement>*/

util.inherits(PassThrough, Transform);

function PassThrough(options) {
  if (!(this instanceof PassThrough)) return new PassThrough(options);

  Transform.call(this, options);
}

PassThrough.prototype._transform = function (chunk, encoding, cb) {
  cb(null, chunk);
};
},{"./_stream_transform":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/readable-stream/lib/_stream_transform.js","core-util-is":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/core-util-is/lib/util.js","inherits":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/inherits/inherits_browser.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/readable-stream/lib/_stream_readable.js":[function(require,module,exports){
(function (process,global){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

'use strict';

/*<replacement>*/

var pna = require('process-nextick-args');
/*</replacement>*/

module.exports = Readable;

/*<replacement>*/
var isArray = require('isarray');
/*</replacement>*/

/*<replacement>*/
var Duplex;
/*</replacement>*/

Readable.ReadableState = ReadableState;

/*<replacement>*/
var EE = require('events').EventEmitter;

var EElistenerCount = function (emitter, type) {
  return emitter.listeners(type).length;
};
/*</replacement>*/

/*<replacement>*/
var Stream = require('./internal/streams/stream');
/*</replacement>*/

/*<replacement>*/

var Buffer = require('safe-buffer').Buffer;
var OurUint8Array = global.Uint8Array || function () {};
function _uint8ArrayToBuffer(chunk) {
  return Buffer.from(chunk);
}
function _isUint8Array(obj) {
  return Buffer.isBuffer(obj) || obj instanceof OurUint8Array;
}

/*</replacement>*/

/*<replacement>*/
var util = require('core-util-is');
util.inherits = require('inherits');
/*</replacement>*/

/*<replacement>*/
var debugUtil = require('util');
var debug = void 0;
if (debugUtil && debugUtil.debuglog) {
  debug = debugUtil.debuglog('stream');
} else {
  debug = function () {};
}
/*</replacement>*/

var BufferList = require('./internal/streams/BufferList');
var destroyImpl = require('./internal/streams/destroy');
var StringDecoder;

util.inherits(Readable, Stream);

var kProxyEvents = ['error', 'close', 'destroy', 'pause', 'resume'];

function prependListener(emitter, event, fn) {
  // Sadly this is not cacheable as some libraries bundle their own
  // event emitter implementation with them.
  if (typeof emitter.prependListener === 'function') return emitter.prependListener(event, fn);

  // This is a hack to make sure that our error handler is attached before any
  // userland ones.  NEVER DO THIS. This is here only because this code needs
  // to continue to work with older versions of Node.js that do not include
  // the prependListener() method. The goal is to eventually remove this hack.
  if (!emitter._events || !emitter._events[event]) emitter.on(event, fn);else if (isArray(emitter._events[event])) emitter._events[event].unshift(fn);else emitter._events[event] = [fn, emitter._events[event]];
}

function ReadableState(options, stream) {
  Duplex = Duplex || require('./_stream_duplex');

  options = options || {};

  // Duplex streams are both readable and writable, but share
  // the same options object.
  // However, some cases require setting options to different
  // values for the readable and the writable sides of the duplex stream.
  // These options can be provided separately as readableXXX and writableXXX.
  var isDuplex = stream instanceof Duplex;

  // object stream flag. Used to make read(n) ignore n and to
  // make all the buffer merging and length checks go away
  this.objectMode = !!options.objectMode;

  if (isDuplex) this.objectMode = this.objectMode || !!options.readableObjectMode;

  // the point at which it stops calling _read() to fill the buffer
  // Note: 0 is a valid value, means "don't call _read preemptively ever"
  var hwm = options.highWaterMark;
  var readableHwm = options.readableHighWaterMark;
  var defaultHwm = this.objectMode ? 16 : 16 * 1024;

  if (hwm || hwm === 0) this.highWaterMark = hwm;else if (isDuplex && (readableHwm || readableHwm === 0)) this.highWaterMark = readableHwm;else this.highWaterMark = defaultHwm;

  // cast to ints.
  this.highWaterMark = Math.floor(this.highWaterMark);

  // A linked list is used to store data chunks instead of an array because the
  // linked list can remove elements from the beginning faster than
  // array.shift()
  this.buffer = new BufferList();
  this.length = 0;
  this.pipes = null;
  this.pipesCount = 0;
  this.flowing = null;
  this.ended = false;
  this.endEmitted = false;
  this.reading = false;

  // a flag to be able to tell if the event 'readable'/'data' is emitted
  // immediately, or on a later tick.  We set this to true at first, because
  // any actions that shouldn't happen until "later" should generally also
  // not happen before the first read call.
  this.sync = true;

  // whenever we return null, then we set a flag to say
  // that we're awaiting a 'readable' event emission.
  this.needReadable = false;
  this.emittedReadable = false;
  this.readableListening = false;
  this.resumeScheduled = false;

  // has it been destroyed
  this.destroyed = false;

  // Crypto is kind of old and crusty.  Historically, its default string
  // encoding is 'binary' so we have to make this configurable.
  // Everything else in the universe uses 'utf8', though.
  this.defaultEncoding = options.defaultEncoding || 'utf8';

  // the number of writers that are awaiting a drain event in .pipe()s
  this.awaitDrain = 0;

  // if true, a maybeReadMore has been scheduled
  this.readingMore = false;

  this.decoder = null;
  this.encoding = null;
  if (options.encoding) {
    if (!StringDecoder) StringDecoder = require('string_decoder/').StringDecoder;
    this.decoder = new StringDecoder(options.encoding);
    this.encoding = options.encoding;
  }
}

function Readable(options) {
  Duplex = Duplex || require('./_stream_duplex');

  if (!(this instanceof Readable)) return new Readable(options);

  this._readableState = new ReadableState(options, this);

  // legacy
  this.readable = true;

  if (options) {
    if (typeof options.read === 'function') this._read = options.read;

    if (typeof options.destroy === 'function') this._destroy = options.destroy;
  }

  Stream.call(this);
}

Object.defineProperty(Readable.prototype, 'destroyed', {
  get: function () {
    if (this._readableState === undefined) {
      return false;
    }
    return this._readableState.destroyed;
  },
  set: function (value) {
    // we ignore the value if the stream
    // has not been initialized yet
    if (!this._readableState) {
      return;
    }

    // backward compatibility, the user is explicitly
    // managing destroyed
    this._readableState.destroyed = value;
  }
});

Readable.prototype.destroy = destroyImpl.destroy;
Readable.prototype._undestroy = destroyImpl.undestroy;
Readable.prototype._destroy = function (err, cb) {
  this.push(null);
  cb(err);
};

// Manually shove something into the read() buffer.
// This returns true if the highWaterMark has not been hit yet,
// similar to how Writable.write() returns true if you should
// write() some more.
Readable.prototype.push = function (chunk, encoding) {
  var state = this._readableState;
  var skipChunkCheck;

  if (!state.objectMode) {
    if (typeof chunk === 'string') {
      encoding = encoding || state.defaultEncoding;
      if (encoding !== state.encoding) {
        chunk = Buffer.from(chunk, encoding);
        encoding = '';
      }
      skipChunkCheck = true;
    }
  } else {
    skipChunkCheck = true;
  }

  return readableAddChunk(this, chunk, encoding, false, skipChunkCheck);
};

// Unshift should *always* be something directly out of read()
Readable.prototype.unshift = function (chunk) {
  return readableAddChunk(this, chunk, null, true, false);
};

function readableAddChunk(stream, chunk, encoding, addToFront, skipChunkCheck) {
  var state = stream._readableState;
  if (chunk === null) {
    state.reading = false;
    onEofChunk(stream, state);
  } else {
    var er;
    if (!skipChunkCheck) er = chunkInvalid(state, chunk);
    if (er) {
      stream.emit('error', er);
    } else if (state.objectMode || chunk && chunk.length > 0) {
      if (typeof chunk !== 'string' && !state.objectMode && Object.getPrototypeOf(chunk) !== Buffer.prototype) {
        chunk = _uint8ArrayToBuffer(chunk);
      }

      if (addToFront) {
        if (state.endEmitted) stream.emit('error', new Error('stream.unshift() after end event'));else addChunk(stream, state, chunk, true);
      } else if (state.ended) {
        stream.emit('error', new Error('stream.push() after EOF'));
      } else {
        state.reading = false;
        if (state.decoder && !encoding) {
          chunk = state.decoder.write(chunk);
          if (state.objectMode || chunk.length !== 0) addChunk(stream, state, chunk, false);else maybeReadMore(stream, state);
        } else {
          addChunk(stream, state, chunk, false);
        }
      }
    } else if (!addToFront) {
      state.reading = false;
    }
  }

  return needMoreData(state);
}

function addChunk(stream, state, chunk, addToFront) {
  if (state.flowing && state.length === 0 && !state.sync) {
    stream.emit('data', chunk);
    stream.read(0);
  } else {
    // update the buffer info.
    state.length += state.objectMode ? 1 : chunk.length;
    if (addToFront) state.buffer.unshift(chunk);else state.buffer.push(chunk);

    if (state.needReadable) emitReadable(stream);
  }
  maybeReadMore(stream, state);
}

function chunkInvalid(state, chunk) {
  var er;
  if (!_isUint8Array(chunk) && typeof chunk !== 'string' && chunk !== undefined && !state.objectMode) {
    er = new TypeError('Invalid non-string/buffer chunk');
  }
  return er;
}

// if it's past the high water mark, we can push in some more.
// Also, if we have no data yet, we can stand some
// more bytes.  This is to work around cases where hwm=0,
// such as the repl.  Also, if the push() triggered a
// readable event, and the user called read(largeNumber) such that
// needReadable was set, then we ought to push more, so that another
// 'readable' event will be triggered.
function needMoreData(state) {
  return !state.ended && (state.needReadable || state.length < state.highWaterMark || state.length === 0);
}

Readable.prototype.isPaused = function () {
  return this._readableState.flowing === false;
};

// backwards compatibility.
Readable.prototype.setEncoding = function (enc) {
  if (!StringDecoder) StringDecoder = require('string_decoder/').StringDecoder;
  this._readableState.decoder = new StringDecoder(enc);
  this._readableState.encoding = enc;
  return this;
};

// Don't raise the hwm > 8MB
var MAX_HWM = 0x800000;
function computeNewHighWaterMark(n) {
  if (n >= MAX_HWM) {
    n = MAX_HWM;
  } else {
    // Get the next highest power of 2 to prevent increasing hwm excessively in
    // tiny amounts
    n--;
    n |= n >>> 1;
    n |= n >>> 2;
    n |= n >>> 4;
    n |= n >>> 8;
    n |= n >>> 16;
    n++;
  }
  return n;
}

// This function is designed to be inlinable, so please take care when making
// changes to the function body.
function howMuchToRead(n, state) {
  if (n <= 0 || state.length === 0 && state.ended) return 0;
  if (state.objectMode) return 1;
  if (n !== n) {
    // Only flow one buffer at a time
    if (state.flowing && state.length) return state.buffer.head.data.length;else return state.length;
  }
  // If we're asking for more than the current hwm, then raise the hwm.
  if (n > state.highWaterMark) state.highWaterMark = computeNewHighWaterMark(n);
  if (n <= state.length) return n;
  // Don't have enough
  if (!state.ended) {
    state.needReadable = true;
    return 0;
  }
  return state.length;
}

// you can override either this method, or the async _read(n) below.
Readable.prototype.read = function (n) {
  debug('read', n);
  n = parseInt(n, 10);
  var state = this._readableState;
  var nOrig = n;

  if (n !== 0) state.emittedReadable = false;

  // if we're doing read(0) to trigger a readable event, but we
  // already have a bunch of data in the buffer, then just trigger
  // the 'readable' event and move on.
  if (n === 0 && state.needReadable && (state.length >= state.highWaterMark || state.ended)) {
    debug('read: emitReadable', state.length, state.ended);
    if (state.length === 0 && state.ended) endReadable(this);else emitReadable(this);
    return null;
  }

  n = howMuchToRead(n, state);

  // if we've ended, and we're now clear, then finish it up.
  if (n === 0 && state.ended) {
    if (state.length === 0) endReadable(this);
    return null;
  }

  // All the actual chunk generation logic needs to be
  // *below* the call to _read.  The reason is that in certain
  // synthetic stream cases, such as passthrough streams, _read
  // may be a completely synchronous operation which may change
  // the state of the read buffer, providing enough data when
  // before there was *not* enough.
  //
  // So, the steps are:
  // 1. Figure out what the state of things will be after we do
  // a read from the buffer.
  //
  // 2. If that resulting state will trigger a _read, then call _read.
  // Note that this may be asynchronous, or synchronous.  Yes, it is
  // deeply ugly to write APIs this way, but that still doesn't mean
  // that the Readable class should behave improperly, as streams are
  // designed to be sync/async agnostic.
  // Take note if the _read call is sync or async (ie, if the read call
  // has returned yet), so that we know whether or not it's safe to emit
  // 'readable' etc.
  //
  // 3. Actually pull the requested chunks out of the buffer and return.

  // if we need a readable event, then we need to do some reading.
  var doRead = state.needReadable;
  debug('need readable', doRead);

  // if we currently have less than the highWaterMark, then also read some
  if (state.length === 0 || state.length - n < state.highWaterMark) {
    doRead = true;
    debug('length less than watermark', doRead);
  }

  // however, if we've ended, then there's no point, and if we're already
  // reading, then it's unnecessary.
  if (state.ended || state.reading) {
    doRead = false;
    debug('reading or ended', doRead);
  } else if (doRead) {
    debug('do read');
    state.reading = true;
    state.sync = true;
    // if the length is currently zero, then we *need* a readable event.
    if (state.length === 0) state.needReadable = true;
    // call internal read method
    this._read(state.highWaterMark);
    state.sync = false;
    // If _read pushed data synchronously, then `reading` will be false,
    // and we need to re-evaluate how much data we can return to the user.
    if (!state.reading) n = howMuchToRead(nOrig, state);
  }

  var ret;
  if (n > 0) ret = fromList(n, state);else ret = null;

  if (ret === null) {
    state.needReadable = true;
    n = 0;
  } else {
    state.length -= n;
  }

  if (state.length === 0) {
    // If we have nothing in the buffer, then we want to know
    // as soon as we *do* get something into the buffer.
    if (!state.ended) state.needReadable = true;

    // If we tried to read() past the EOF, then emit end on the next tick.
    if (nOrig !== n && state.ended) endReadable(this);
  }

  if (ret !== null) this.emit('data', ret);

  return ret;
};

function onEofChunk(stream, state) {
  if (state.ended) return;
  if (state.decoder) {
    var chunk = state.decoder.end();
    if (chunk && chunk.length) {
      state.buffer.push(chunk);
      state.length += state.objectMode ? 1 : chunk.length;
    }
  }
  state.ended = true;

  // emit 'readable' now to make sure it gets picked up.
  emitReadable(stream);
}

// Don't emit readable right away in sync mode, because this can trigger
// another read() call => stack overflow.  This way, it might trigger
// a nextTick recursion warning, but that's not so bad.
function emitReadable(stream) {
  var state = stream._readableState;
  state.needReadable = false;
  if (!state.emittedReadable) {
    debug('emitReadable', state.flowing);
    state.emittedReadable = true;
    if (state.sync) pna.nextTick(emitReadable_, stream);else emitReadable_(stream);
  }
}

function emitReadable_(stream) {
  debug('emit readable');
  stream.emit('readable');
  flow(stream);
}

// at this point, the user has presumably seen the 'readable' event,
// and called read() to consume some data.  that may have triggered
// in turn another _read(n) call, in which case reading = true if
// it's in progress.
// However, if we're not ended, or reading, and the length < hwm,
// then go ahead and try to read some more preemptively.
function maybeReadMore(stream, state) {
  if (!state.readingMore) {
    state.readingMore = true;
    pna.nextTick(maybeReadMore_, stream, state);
  }
}

function maybeReadMore_(stream, state) {
  var len = state.length;
  while (!state.reading && !state.flowing && !state.ended && state.length < state.highWaterMark) {
    debug('maybeReadMore read 0');
    stream.read(0);
    if (len === state.length)
      // didn't get any data, stop spinning.
      break;else len = state.length;
  }
  state.readingMore = false;
}

// abstract method.  to be overridden in specific implementation classes.
// call cb(er, data) where data is <= n in length.
// for virtual (non-string, non-buffer) streams, "length" is somewhat
// arbitrary, and perhaps not very meaningful.
Readable.prototype._read = function (n) {
  this.emit('error', new Error('_read() is not implemented'));
};

Readable.prototype.pipe = function (dest, pipeOpts) {
  var src = this;
  var state = this._readableState;

  switch (state.pipesCount) {
    case 0:
      state.pipes = dest;
      break;
    case 1:
      state.pipes = [state.pipes, dest];
      break;
    default:
      state.pipes.push(dest);
      break;
  }
  state.pipesCount += 1;
  debug('pipe count=%d opts=%j', state.pipesCount, pipeOpts);

  var doEnd = (!pipeOpts || pipeOpts.end !== false) && dest !== process.stdout && dest !== process.stderr;

  var endFn = doEnd ? onend : unpipe;
  if (state.endEmitted) pna.nextTick(endFn);else src.once('end', endFn);

  dest.on('unpipe', onunpipe);
  function onunpipe(readable, unpipeInfo) {
    debug('onunpipe');
    if (readable === src) {
      if (unpipeInfo && unpipeInfo.hasUnpiped === false) {
        unpipeInfo.hasUnpiped = true;
        cleanup();
      }
    }
  }

  function onend() {
    debug('onend');
    dest.end();
  }

  // when the dest drains, it reduces the awaitDrain counter
  // on the source.  This would be more elegant with a .once()
  // handler in flow(), but adding and removing repeatedly is
  // too slow.
  var ondrain = pipeOnDrain(src);
  dest.on('drain', ondrain);

  var cleanedUp = false;
  function cleanup() {
    debug('cleanup');
    // cleanup event handlers once the pipe is broken
    dest.removeListener('close', onclose);
    dest.removeListener('finish', onfinish);
    dest.removeListener('drain', ondrain);
    dest.removeListener('error', onerror);
    dest.removeListener('unpipe', onunpipe);
    src.removeListener('end', onend);
    src.removeListener('end', unpipe);
    src.removeListener('data', ondata);

    cleanedUp = true;

    // if the reader is waiting for a drain event from this
    // specific writer, then it would cause it to never start
    // flowing again.
    // So, if this is awaiting a drain, then we just call it now.
    // If we don't know, then assume that we are waiting for one.
    if (state.awaitDrain && (!dest._writableState || dest._writableState.needDrain)) ondrain();
  }

  // If the user pushes more data while we're writing to dest then we'll end up
  // in ondata again. However, we only want to increase awaitDrain once because
  // dest will only emit one 'drain' event for the multiple writes.
  // => Introduce a guard on increasing awaitDrain.
  var increasedAwaitDrain = false;
  src.on('data', ondata);
  function ondata(chunk) {
    debug('ondata');
    increasedAwaitDrain = false;
    var ret = dest.write(chunk);
    if (false === ret && !increasedAwaitDrain) {
      // If the user unpiped during `dest.write()`, it is possible
      // to get stuck in a permanently paused state if that write
      // also returned false.
      // => Check whether `dest` is still a piping destination.
      if ((state.pipesCount === 1 && state.pipes === dest || state.pipesCount > 1 && indexOf(state.pipes, dest) !== -1) && !cleanedUp) {
        debug('false write response, pause', src._readableState.awaitDrain);
        src._readableState.awaitDrain++;
        increasedAwaitDrain = true;
      }
      src.pause();
    }
  }

  // if the dest has an error, then stop piping into it.
  // however, don't suppress the throwing behavior for this.
  function onerror(er) {
    debug('onerror', er);
    unpipe();
    dest.removeListener('error', onerror);
    if (EElistenerCount(dest, 'error') === 0) dest.emit('error', er);
  }

  // Make sure our error handler is attached before userland ones.
  prependListener(dest, 'error', onerror);

  // Both close and finish should trigger unpipe, but only once.
  function onclose() {
    dest.removeListener('finish', onfinish);
    unpipe();
  }
  dest.once('close', onclose);
  function onfinish() {
    debug('onfinish');
    dest.removeListener('close', onclose);
    unpipe();
  }
  dest.once('finish', onfinish);

  function unpipe() {
    debug('unpipe');
    src.unpipe(dest);
  }

  // tell the dest that it's being piped to
  dest.emit('pipe', src);

  // start the flow if it hasn't been started already.
  if (!state.flowing) {
    debug('pipe resume');
    src.resume();
  }

  return dest;
};

function pipeOnDrain(src) {
  return function () {
    var state = src._readableState;
    debug('pipeOnDrain', state.awaitDrain);
    if (state.awaitDrain) state.awaitDrain--;
    if (state.awaitDrain === 0 && EElistenerCount(src, 'data')) {
      state.flowing = true;
      flow(src);
    }
  };
}

Readable.prototype.unpipe = function (dest) {
  var state = this._readableState;
  var unpipeInfo = { hasUnpiped: false };

  // if we're not piping anywhere, then do nothing.
  if (state.pipesCount === 0) return this;

  // just one destination.  most common case.
  if (state.pipesCount === 1) {
    // passed in one, but it's not the right one.
    if (dest && dest !== state.pipes) return this;

    if (!dest) dest = state.pipes;

    // got a match.
    state.pipes = null;
    state.pipesCount = 0;
    state.flowing = false;
    if (dest) dest.emit('unpipe', this, unpipeInfo);
    return this;
  }

  // slow case. multiple pipe destinations.

  if (!dest) {
    // remove all.
    var dests = state.pipes;
    var len = state.pipesCount;
    state.pipes = null;
    state.pipesCount = 0;
    state.flowing = false;

    for (var i = 0; i < len; i++) {
      dests[i].emit('unpipe', this, unpipeInfo);
    }return this;
  }

  // try to find the right one.
  var index = indexOf(state.pipes, dest);
  if (index === -1) return this;

  state.pipes.splice(index, 1);
  state.pipesCount -= 1;
  if (state.pipesCount === 1) state.pipes = state.pipes[0];

  dest.emit('unpipe', this, unpipeInfo);

  return this;
};

// set up data events if they are asked for
// Ensure readable listeners eventually get something
Readable.prototype.on = function (ev, fn) {
  var res = Stream.prototype.on.call(this, ev, fn);

  if (ev === 'data') {
    // Start flowing on next tick if stream isn't explicitly paused
    if (this._readableState.flowing !== false) this.resume();
  } else if (ev === 'readable') {
    var state = this._readableState;
    if (!state.endEmitted && !state.readableListening) {
      state.readableListening = state.needReadable = true;
      state.emittedReadable = false;
      if (!state.reading) {
        pna.nextTick(nReadingNextTick, this);
      } else if (state.length) {
        emitReadable(this);
      }
    }
  }

  return res;
};
Readable.prototype.addListener = Readable.prototype.on;

function nReadingNextTick(self) {
  debug('readable nexttick read 0');
  self.read(0);
}

// pause() and resume() are remnants of the legacy readable stream API
// If the user uses them, then switch into old mode.
Readable.prototype.resume = function () {
  var state = this._readableState;
  if (!state.flowing) {
    debug('resume');
    state.flowing = true;
    resume(this, state);
  }
  return this;
};

function resume(stream, state) {
  if (!state.resumeScheduled) {
    state.resumeScheduled = true;
    pna.nextTick(resume_, stream, state);
  }
}

function resume_(stream, state) {
  if (!state.reading) {
    debug('resume read 0');
    stream.read(0);
  }

  state.resumeScheduled = false;
  state.awaitDrain = 0;
  stream.emit('resume');
  flow(stream);
  if (state.flowing && !state.reading) stream.read(0);
}

Readable.prototype.pause = function () {
  debug('call pause flowing=%j', this._readableState.flowing);
  if (false !== this._readableState.flowing) {
    debug('pause');
    this._readableState.flowing = false;
    this.emit('pause');
  }
  return this;
};

function flow(stream) {
  var state = stream._readableState;
  debug('flow', state.flowing);
  while (state.flowing && stream.read() !== null) {}
}

// wrap an old-style stream as the async data source.
// This is *not* part of the readable stream interface.
// It is an ugly unfortunate mess of history.
Readable.prototype.wrap = function (stream) {
  var _this = this;

  var state = this._readableState;
  var paused = false;

  stream.on('end', function () {
    debug('wrapped end');
    if (state.decoder && !state.ended) {
      var chunk = state.decoder.end();
      if (chunk && chunk.length) _this.push(chunk);
    }

    _this.push(null);
  });

  stream.on('data', function (chunk) {
    debug('wrapped data');
    if (state.decoder) chunk = state.decoder.write(chunk);

    // don't skip over falsy values in objectMode
    if (state.objectMode && (chunk === null || chunk === undefined)) return;else if (!state.objectMode && (!chunk || !chunk.length)) return;

    var ret = _this.push(chunk);
    if (!ret) {
      paused = true;
      stream.pause();
    }
  });

  // proxy all the other methods.
  // important when wrapping filters and duplexes.
  for (var i in stream) {
    if (this[i] === undefined && typeof stream[i] === 'function') {
      this[i] = function (method) {
        return function () {
          return stream[method].apply(stream, arguments);
        };
      }(i);
    }
  }

  // proxy certain important events.
  for (var n = 0; n < kProxyEvents.length; n++) {
    stream.on(kProxyEvents[n], this.emit.bind(this, kProxyEvents[n]));
  }

  // when we try to consume some more bytes, simply unpause the
  // underlying stream.
  this._read = function (n) {
    debug('wrapped _read', n);
    if (paused) {
      paused = false;
      stream.resume();
    }
  };

  return this;
};

Object.defineProperty(Readable.prototype, 'readableHighWaterMark', {
  // making it explicit this property is not enumerable
  // because otherwise some prototype manipulation in
  // userland will fail
  enumerable: false,
  get: function () {
    return this._readableState.highWaterMark;
  }
});

// exposed for testing purposes only.
Readable._fromList = fromList;

// Pluck off n bytes from an array of buffers.
// Length is the combined lengths of all the buffers in the list.
// This function is designed to be inlinable, so please take care when making
// changes to the function body.
function fromList(n, state) {
  // nothing buffered
  if (state.length === 0) return null;

  var ret;
  if (state.objectMode) ret = state.buffer.shift();else if (!n || n >= state.length) {
    // read it all, truncate the list
    if (state.decoder) ret = state.buffer.join('');else if (state.buffer.length === 1) ret = state.buffer.head.data;else ret = state.buffer.concat(state.length);
    state.buffer.clear();
  } else {
    // read part of list
    ret = fromListPartial(n, state.buffer, state.decoder);
  }

  return ret;
}

// Extracts only enough buffered data to satisfy the amount requested.
// This function is designed to be inlinable, so please take care when making
// changes to the function body.
function fromListPartial(n, list, hasStrings) {
  var ret;
  if (n < list.head.data.length) {
    // slice is the same for buffers and strings
    ret = list.head.data.slice(0, n);
    list.head.data = list.head.data.slice(n);
  } else if (n === list.head.data.length) {
    // first chunk is a perfect match
    ret = list.shift();
  } else {
    // result spans more than one buffer
    ret = hasStrings ? copyFromBufferString(n, list) : copyFromBuffer(n, list);
  }
  return ret;
}

// Copies a specified amount of characters from the list of buffered data
// chunks.
// This function is designed to be inlinable, so please take care when making
// changes to the function body.
function copyFromBufferString(n, list) {
  var p = list.head;
  var c = 1;
  var ret = p.data;
  n -= ret.length;
  while (p = p.next) {
    var str = p.data;
    var nb = n > str.length ? str.length : n;
    if (nb === str.length) ret += str;else ret += str.slice(0, n);
    n -= nb;
    if (n === 0) {
      if (nb === str.length) {
        ++c;
        if (p.next) list.head = p.next;else list.head = list.tail = null;
      } else {
        list.head = p;
        p.data = str.slice(nb);
      }
      break;
    }
    ++c;
  }
  list.length -= c;
  return ret;
}

// Copies a specified amount of bytes from the list of buffered data chunks.
// This function is designed to be inlinable, so please take care when making
// changes to the function body.
function copyFromBuffer(n, list) {
  var ret = Buffer.allocUnsafe(n);
  var p = list.head;
  var c = 1;
  p.data.copy(ret);
  n -= p.data.length;
  while (p = p.next) {
    var buf = p.data;
    var nb = n > buf.length ? buf.length : n;
    buf.copy(ret, ret.length - n, 0, nb);
    n -= nb;
    if (n === 0) {
      if (nb === buf.length) {
        ++c;
        if (p.next) list.head = p.next;else list.head = list.tail = null;
      } else {
        list.head = p;
        p.data = buf.slice(nb);
      }
      break;
    }
    ++c;
  }
  list.length -= c;
  return ret;
}

function endReadable(stream) {
  var state = stream._readableState;

  // If we get here before consuming all the bytes, then that is a
  // bug in node.  Should never happen.
  if (state.length > 0) throw new Error('"endReadable()" called on non-empty stream');

  if (!state.endEmitted) {
    state.ended = true;
    pna.nextTick(endReadableNT, state, stream);
  }
}

function endReadableNT(state, stream) {
  // Check that we didn't get one last unshift.
  if (!state.endEmitted && state.length === 0) {
    state.endEmitted = true;
    stream.readable = false;
    stream.emit('end');
  }
}

function indexOf(xs, x) {
  for (var i = 0, l = xs.length; i < l; i++) {
    if (xs[i] === x) return i;
  }
  return -1;
}
}).call(this,require('_process'),typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./_stream_duplex":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/readable-stream/lib/_stream_duplex.js","./internal/streams/BufferList":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/readable-stream/lib/internal/streams/BufferList.js","./internal/streams/destroy":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/readable-stream/lib/internal/streams/destroy.js","./internal/streams/stream":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/readable-stream/lib/internal/streams/stream-browser.js","_process":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/process/browser.js","core-util-is":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/core-util-is/lib/util.js","events":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/browserify/node_modules/events/events.js","inherits":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/inherits/inherits_browser.js","isarray":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/isarray/index.js","process-nextick-args":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/process-nextick-args/index.js","safe-buffer":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/safe-buffer/index.js","string_decoder/":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/string_decoder/lib/string_decoder.js","util":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/browser-resolve/empty.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/readable-stream/lib/_stream_transform.js":[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// a transform stream is a readable/writable stream where you do
// something with the data.  Sometimes it's called a "filter",
// but that's not a great name for it, since that implies a thing where
// some bits pass through, and others are simply ignored.  (That would
// be a valid example of a transform, of course.)
//
// While the output is causally related to the input, it's not a
// necessarily symmetric or synchronous transformation.  For example,
// a zlib stream might take multiple plain-text writes(), and then
// emit a single compressed chunk some time in the future.
//
// Here's how this works:
//
// The Transform stream has all the aspects of the readable and writable
// stream classes.  When you write(chunk), that calls _write(chunk,cb)
// internally, and returns false if there's a lot of pending writes
// buffered up.  When you call read(), that calls _read(n) until
// there's enough pending readable data buffered up.
//
// In a transform stream, the written data is placed in a buffer.  When
// _read(n) is called, it transforms the queued up data, calling the
// buffered _write cb's as it consumes chunks.  If consuming a single
// written chunk would result in multiple output chunks, then the first
// outputted bit calls the readcb, and subsequent chunks just go into
// the read buffer, and will cause it to emit 'readable' if necessary.
//
// This way, back-pressure is actually determined by the reading side,
// since _read has to be called to start processing a new chunk.  However,
// a pathological inflate type of transform can cause excessive buffering
// here.  For example, imagine a stream where every byte of input is
// interpreted as an integer from 0-255, and then results in that many
// bytes of output.  Writing the 4 bytes {ff,ff,ff,ff} would result in
// 1kb of data being output.  In this case, you could write a very small
// amount of input, and end up with a very large amount of output.  In
// such a pathological inflating mechanism, there'd be no way to tell
// the system to stop doing the transform.  A single 4MB write could
// cause the system to run out of memory.
//
// However, even in such a pathological case, only a single written chunk
// would be consumed, and then the rest would wait (un-transformed) until
// the results of the previous transformed chunk were consumed.

'use strict';

module.exports = Transform;

var Duplex = require('./_stream_duplex');

/*<replacement>*/
var util = require('core-util-is');
util.inherits = require('inherits');
/*</replacement>*/

util.inherits(Transform, Duplex);

function afterTransform(er, data) {
  var ts = this._transformState;
  ts.transforming = false;

  var cb = ts.writecb;

  if (!cb) {
    return this.emit('error', new Error('write callback called multiple times'));
  }

  ts.writechunk = null;
  ts.writecb = null;

  if (data != null) // single equals check for both `null` and `undefined`
    this.push(data);

  cb(er);

  var rs = this._readableState;
  rs.reading = false;
  if (rs.needReadable || rs.length < rs.highWaterMark) {
    this._read(rs.highWaterMark);
  }
}

function Transform(options) {
  if (!(this instanceof Transform)) return new Transform(options);

  Duplex.call(this, options);

  this._transformState = {
    afterTransform: afterTransform.bind(this),
    needTransform: false,
    transforming: false,
    writecb: null,
    writechunk: null,
    writeencoding: null
  };

  // start out asking for a readable event once data is transformed.
  this._readableState.needReadable = true;

  // we have implemented the _read method, and done the other things
  // that Readable wants before the first _read call, so unset the
  // sync guard flag.
  this._readableState.sync = false;

  if (options) {
    if (typeof options.transform === 'function') this._transform = options.transform;

    if (typeof options.flush === 'function') this._flush = options.flush;
  }

  // When the writable side finishes, then flush out anything remaining.
  this.on('prefinish', prefinish);
}

function prefinish() {
  var _this = this;

  if (typeof this._flush === 'function') {
    this._flush(function (er, data) {
      done(_this, er, data);
    });
  } else {
    done(this, null, null);
  }
}

Transform.prototype.push = function (chunk, encoding) {
  this._transformState.needTransform = false;
  return Duplex.prototype.push.call(this, chunk, encoding);
};

// This is the part where you do stuff!
// override this function in implementation classes.
// 'chunk' is an input chunk.
//
// Call `push(newChunk)` to pass along transformed output
// to the readable side.  You may call 'push' zero or more times.
//
// Call `cb(err)` when you are done with this chunk.  If you pass
// an error, then that'll put the hurt on the whole operation.  If you
// never call cb(), then you'll never get another chunk.
Transform.prototype._transform = function (chunk, encoding, cb) {
  throw new Error('_transform() is not implemented');
};

Transform.prototype._write = function (chunk, encoding, cb) {
  var ts = this._transformState;
  ts.writecb = cb;
  ts.writechunk = chunk;
  ts.writeencoding = encoding;
  if (!ts.transforming) {
    var rs = this._readableState;
    if (ts.needTransform || rs.needReadable || rs.length < rs.highWaterMark) this._read(rs.highWaterMark);
  }
};

// Doesn't matter what the args are here.
// _transform does all the work.
// That we got here means that the readable side wants more data.
Transform.prototype._read = function (n) {
  var ts = this._transformState;

  if (ts.writechunk !== null && ts.writecb && !ts.transforming) {
    ts.transforming = true;
    this._transform(ts.writechunk, ts.writeencoding, ts.afterTransform);
  } else {
    // mark that we need a transform, so that any data that comes in
    // will get processed, now that we've asked for it.
    ts.needTransform = true;
  }
};

Transform.prototype._destroy = function (err, cb) {
  var _this2 = this;

  Duplex.prototype._destroy.call(this, err, function (err2) {
    cb(err2);
    _this2.emit('close');
  });
};

function done(stream, er, data) {
  if (er) return stream.emit('error', er);

  if (data != null) // single equals check for both `null` and `undefined`
    stream.push(data);

  // if there's nothing in the write buffer, then that means
  // that nothing more will ever be provided
  if (stream._writableState.length) throw new Error('Calling transform done when ws.length != 0');

  if (stream._transformState.transforming) throw new Error('Calling transform done when still transforming');

  return stream.push(null);
}
},{"./_stream_duplex":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/readable-stream/lib/_stream_duplex.js","core-util-is":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/core-util-is/lib/util.js","inherits":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/inherits/inherits_browser.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/readable-stream/lib/_stream_writable.js":[function(require,module,exports){
(function (process,global,setImmediate){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// A bit simpler than readable streams.
// Implement an async ._write(chunk, encoding, cb), and it'll handle all
// the drain event emission and buffering.

'use strict';

/*<replacement>*/

var pna = require('process-nextick-args');
/*</replacement>*/

module.exports = Writable;

/* <replacement> */
function WriteReq(chunk, encoding, cb) {
  this.chunk = chunk;
  this.encoding = encoding;
  this.callback = cb;
  this.next = null;
}

// It seems a linked list but it is not
// there will be only 2 of these for each stream
function CorkedRequest(state) {
  var _this = this;

  this.next = null;
  this.entry = null;
  this.finish = function () {
    onCorkedFinish(_this, state);
  };
}
/* </replacement> */

/*<replacement>*/
var asyncWrite = !process.browser && ['v0.10', 'v0.9.'].indexOf(process.version.slice(0, 5)) > -1 ? setImmediate : pna.nextTick;
/*</replacement>*/

/*<replacement>*/
var Duplex;
/*</replacement>*/

Writable.WritableState = WritableState;

/*<replacement>*/
var util = require('core-util-is');
util.inherits = require('inherits');
/*</replacement>*/

/*<replacement>*/
var internalUtil = {
  deprecate: require('util-deprecate')
};
/*</replacement>*/

/*<replacement>*/
var Stream = require('./internal/streams/stream');
/*</replacement>*/

/*<replacement>*/

var Buffer = require('safe-buffer').Buffer;
var OurUint8Array = global.Uint8Array || function () {};
function _uint8ArrayToBuffer(chunk) {
  return Buffer.from(chunk);
}
function _isUint8Array(obj) {
  return Buffer.isBuffer(obj) || obj instanceof OurUint8Array;
}

/*</replacement>*/

var destroyImpl = require('./internal/streams/destroy');

util.inherits(Writable, Stream);

function nop() {}

function WritableState(options, stream) {
  Duplex = Duplex || require('./_stream_duplex');

  options = options || {};

  // Duplex streams are both readable and writable, but share
  // the same options object.
  // However, some cases require setting options to different
  // values for the readable and the writable sides of the duplex stream.
  // These options can be provided separately as readableXXX and writableXXX.
  var isDuplex = stream instanceof Duplex;

  // object stream flag to indicate whether or not this stream
  // contains buffers or objects.
  this.objectMode = !!options.objectMode;

  if (isDuplex) this.objectMode = this.objectMode || !!options.writableObjectMode;

  // the point at which write() starts returning false
  // Note: 0 is a valid value, means that we always return false if
  // the entire buffer is not flushed immediately on write()
  var hwm = options.highWaterMark;
  var writableHwm = options.writableHighWaterMark;
  var defaultHwm = this.objectMode ? 16 : 16 * 1024;

  if (hwm || hwm === 0) this.highWaterMark = hwm;else if (isDuplex && (writableHwm || writableHwm === 0)) this.highWaterMark = writableHwm;else this.highWaterMark = defaultHwm;

  // cast to ints.
  this.highWaterMark = Math.floor(this.highWaterMark);

  // if _final has been called
  this.finalCalled = false;

  // drain event flag.
  this.needDrain = false;
  // at the start of calling end()
  this.ending = false;
  // when end() has been called, and returned
  this.ended = false;
  // when 'finish' is emitted
  this.finished = false;

  // has it been destroyed
  this.destroyed = false;

  // should we decode strings into buffers before passing to _write?
  // this is here so that some node-core streams can optimize string
  // handling at a lower level.
  var noDecode = options.decodeStrings === false;
  this.decodeStrings = !noDecode;

  // Crypto is kind of old and crusty.  Historically, its default string
  // encoding is 'binary' so we have to make this configurable.
  // Everything else in the universe uses 'utf8', though.
  this.defaultEncoding = options.defaultEncoding || 'utf8';

  // not an actual buffer we keep track of, but a measurement
  // of how much we're waiting to get pushed to some underlying
  // socket or file.
  this.length = 0;

  // a flag to see when we're in the middle of a write.
  this.writing = false;

  // when true all writes will be buffered until .uncork() call
  this.corked = 0;

  // a flag to be able to tell if the onwrite cb is called immediately,
  // or on a later tick.  We set this to true at first, because any
  // actions that shouldn't happen until "later" should generally also
  // not happen before the first write call.
  this.sync = true;

  // a flag to know if we're processing previously buffered items, which
  // may call the _write() callback in the same tick, so that we don't
  // end up in an overlapped onwrite situation.
  this.bufferProcessing = false;

  // the callback that's passed to _write(chunk,cb)
  this.onwrite = function (er) {
    onwrite(stream, er);
  };

  // the callback that the user supplies to write(chunk,encoding,cb)
  this.writecb = null;

  // the amount that is being written when _write is called.
  this.writelen = 0;

  this.bufferedRequest = null;
  this.lastBufferedRequest = null;

  // number of pending user-supplied write callbacks
  // this must be 0 before 'finish' can be emitted
  this.pendingcb = 0;

  // emit prefinish if the only thing we're waiting for is _write cbs
  // This is relevant for synchronous Transform streams
  this.prefinished = false;

  // True if the error was already emitted and should not be thrown again
  this.errorEmitted = false;

  // count buffered requests
  this.bufferedRequestCount = 0;

  // allocate the first CorkedRequest, there is always
  // one allocated and free to use, and we maintain at most two
  this.corkedRequestsFree = new CorkedRequest(this);
}

WritableState.prototype.getBuffer = function getBuffer() {
  var current = this.bufferedRequest;
  var out = [];
  while (current) {
    out.push(current);
    current = current.next;
  }
  return out;
};

(function () {
  try {
    Object.defineProperty(WritableState.prototype, 'buffer', {
      get: internalUtil.deprecate(function () {
        return this.getBuffer();
      }, '_writableState.buffer is deprecated. Use _writableState.getBuffer ' + 'instead.', 'DEP0003')
    });
  } catch (_) {}
})();

// Test _writableState for inheritance to account for Duplex streams,
// whose prototype chain only points to Readable.
var realHasInstance;
if (typeof Symbol === 'function' && Symbol.hasInstance && typeof Function.prototype[Symbol.hasInstance] === 'function') {
  realHasInstance = Function.prototype[Symbol.hasInstance];
  Object.defineProperty(Writable, Symbol.hasInstance, {
    value: function (object) {
      if (realHasInstance.call(this, object)) return true;
      if (this !== Writable) return false;

      return object && object._writableState instanceof WritableState;
    }
  });
} else {
  realHasInstance = function (object) {
    return object instanceof this;
  };
}

function Writable(options) {
  Duplex = Duplex || require('./_stream_duplex');

  // Writable ctor is applied to Duplexes, too.
  // `realHasInstance` is necessary because using plain `instanceof`
  // would return false, as no `_writableState` property is attached.

  // Trying to use the custom `instanceof` for Writable here will also break the
  // Node.js LazyTransform implementation, which has a non-trivial getter for
  // `_writableState` that would lead to infinite recursion.
  if (!realHasInstance.call(Writable, this) && !(this instanceof Duplex)) {
    return new Writable(options);
  }

  this._writableState = new WritableState(options, this);

  // legacy.
  this.writable = true;

  if (options) {
    if (typeof options.write === 'function') this._write = options.write;

    if (typeof options.writev === 'function') this._writev = options.writev;

    if (typeof options.destroy === 'function') this._destroy = options.destroy;

    if (typeof options.final === 'function') this._final = options.final;
  }

  Stream.call(this);
}

// Otherwise people can pipe Writable streams, which is just wrong.
Writable.prototype.pipe = function () {
  this.emit('error', new Error('Cannot pipe, not readable'));
};

function writeAfterEnd(stream, cb) {
  var er = new Error('write after end');
  // TODO: defer error events consistently everywhere, not just the cb
  stream.emit('error', er);
  pna.nextTick(cb, er);
}

// Checks that a user-supplied chunk is valid, especially for the particular
// mode the stream is in. Currently this means that `null` is never accepted
// and undefined/non-string values are only allowed in object mode.
function validChunk(stream, state, chunk, cb) {
  var valid = true;
  var er = false;

  if (chunk === null) {
    er = new TypeError('May not write null values to stream');
  } else if (typeof chunk !== 'string' && chunk !== undefined && !state.objectMode) {
    er = new TypeError('Invalid non-string/buffer chunk');
  }
  if (er) {
    stream.emit('error', er);
    pna.nextTick(cb, er);
    valid = false;
  }
  return valid;
}

Writable.prototype.write = function (chunk, encoding, cb) {
  var state = this._writableState;
  var ret = false;
  var isBuf = !state.objectMode && _isUint8Array(chunk);

  if (isBuf && !Buffer.isBuffer(chunk)) {
    chunk = _uint8ArrayToBuffer(chunk);
  }

  if (typeof encoding === 'function') {
    cb = encoding;
    encoding = null;
  }

  if (isBuf) encoding = 'buffer';else if (!encoding) encoding = state.defaultEncoding;

  if (typeof cb !== 'function') cb = nop;

  if (state.ended) writeAfterEnd(this, cb);else if (isBuf || validChunk(this, state, chunk, cb)) {
    state.pendingcb++;
    ret = writeOrBuffer(this, state, isBuf, chunk, encoding, cb);
  }

  return ret;
};

Writable.prototype.cork = function () {
  var state = this._writableState;

  state.corked++;
};

Writable.prototype.uncork = function () {
  var state = this._writableState;

  if (state.corked) {
    state.corked--;

    if (!state.writing && !state.corked && !state.finished && !state.bufferProcessing && state.bufferedRequest) clearBuffer(this, state);
  }
};

Writable.prototype.setDefaultEncoding = function setDefaultEncoding(encoding) {
  // node::ParseEncoding() requires lower case.
  if (typeof encoding === 'string') encoding = encoding.toLowerCase();
  if (!(['hex', 'utf8', 'utf-8', 'ascii', 'binary', 'base64', 'ucs2', 'ucs-2', 'utf16le', 'utf-16le', 'raw'].indexOf((encoding + '').toLowerCase()) > -1)) throw new TypeError('Unknown encoding: ' + encoding);
  this._writableState.defaultEncoding = encoding;
  return this;
};

function decodeChunk(state, chunk, encoding) {
  if (!state.objectMode && state.decodeStrings !== false && typeof chunk === 'string') {
    chunk = Buffer.from(chunk, encoding);
  }
  return chunk;
}

Object.defineProperty(Writable.prototype, 'writableHighWaterMark', {
  // making it explicit this property is not enumerable
  // because otherwise some prototype manipulation in
  // userland will fail
  enumerable: false,
  get: function () {
    return this._writableState.highWaterMark;
  }
});

// if we're already writing something, then just put this
// in the queue, and wait our turn.  Otherwise, call _write
// If we return false, then we need a drain event, so set that flag.
function writeOrBuffer(stream, state, isBuf, chunk, encoding, cb) {
  if (!isBuf) {
    var newChunk = decodeChunk(state, chunk, encoding);
    if (chunk !== newChunk) {
      isBuf = true;
      encoding = 'buffer';
      chunk = newChunk;
    }
  }
  var len = state.objectMode ? 1 : chunk.length;

  state.length += len;

  var ret = state.length < state.highWaterMark;
  // we must ensure that previous needDrain will not be reset to false.
  if (!ret) state.needDrain = true;

  if (state.writing || state.corked) {
    var last = state.lastBufferedRequest;
    state.lastBufferedRequest = {
      chunk: chunk,
      encoding: encoding,
      isBuf: isBuf,
      callback: cb,
      next: null
    };
    if (last) {
      last.next = state.lastBufferedRequest;
    } else {
      state.bufferedRequest = state.lastBufferedRequest;
    }
    state.bufferedRequestCount += 1;
  } else {
    doWrite(stream, state, false, len, chunk, encoding, cb);
  }

  return ret;
}

function doWrite(stream, state, writev, len, chunk, encoding, cb) {
  state.writelen = len;
  state.writecb = cb;
  state.writing = true;
  state.sync = true;
  if (writev) stream._writev(chunk, state.onwrite);else stream._write(chunk, encoding, state.onwrite);
  state.sync = false;
}

function onwriteError(stream, state, sync, er, cb) {
  --state.pendingcb;

  if (sync) {
    // defer the callback if we are being called synchronously
    // to avoid piling up things on the stack
    pna.nextTick(cb, er);
    // this can emit finish, and it will always happen
    // after error
    pna.nextTick(finishMaybe, stream, state);
    stream._writableState.errorEmitted = true;
    stream.emit('error', er);
  } else {
    // the caller expect this to happen before if
    // it is async
    cb(er);
    stream._writableState.errorEmitted = true;
    stream.emit('error', er);
    // this can emit finish, but finish must
    // always follow error
    finishMaybe(stream, state);
  }
}

function onwriteStateUpdate(state) {
  state.writing = false;
  state.writecb = null;
  state.length -= state.writelen;
  state.writelen = 0;
}

function onwrite(stream, er) {
  var state = stream._writableState;
  var sync = state.sync;
  var cb = state.writecb;

  onwriteStateUpdate(state);

  if (er) onwriteError(stream, state, sync, er, cb);else {
    // Check if we're actually ready to finish, but don't emit yet
    var finished = needFinish(state);

    if (!finished && !state.corked && !state.bufferProcessing && state.bufferedRequest) {
      clearBuffer(stream, state);
    }

    if (sync) {
      /*<replacement>*/
      asyncWrite(afterWrite, stream, state, finished, cb);
      /*</replacement>*/
    } else {
      afterWrite(stream, state, finished, cb);
    }
  }
}

function afterWrite(stream, state, finished, cb) {
  if (!finished) onwriteDrain(stream, state);
  state.pendingcb--;
  cb();
  finishMaybe(stream, state);
}

// Must force callback to be called on nextTick, so that we don't
// emit 'drain' before the write() consumer gets the 'false' return
// value, and has a chance to attach a 'drain' listener.
function onwriteDrain(stream, state) {
  if (state.length === 0 && state.needDrain) {
    state.needDrain = false;
    stream.emit('drain');
  }
}

// if there's something in the buffer waiting, then process it
function clearBuffer(stream, state) {
  state.bufferProcessing = true;
  var entry = state.bufferedRequest;

  if (stream._writev && entry && entry.next) {
    // Fast case, write everything using _writev()
    var l = state.bufferedRequestCount;
    var buffer = new Array(l);
    var holder = state.corkedRequestsFree;
    holder.entry = entry;

    var count = 0;
    var allBuffers = true;
    while (entry) {
      buffer[count] = entry;
      if (!entry.isBuf) allBuffers = false;
      entry = entry.next;
      count += 1;
    }
    buffer.allBuffers = allBuffers;

    doWrite(stream, state, true, state.length, buffer, '', holder.finish);

    // doWrite is almost always async, defer these to save a bit of time
    // as the hot path ends with doWrite
    state.pendingcb++;
    state.lastBufferedRequest = null;
    if (holder.next) {
      state.corkedRequestsFree = holder.next;
      holder.next = null;
    } else {
      state.corkedRequestsFree = new CorkedRequest(state);
    }
    state.bufferedRequestCount = 0;
  } else {
    // Slow case, write chunks one-by-one
    while (entry) {
      var chunk = entry.chunk;
      var encoding = entry.encoding;
      var cb = entry.callback;
      var len = state.objectMode ? 1 : chunk.length;

      doWrite(stream, state, false, len, chunk, encoding, cb);
      entry = entry.next;
      state.bufferedRequestCount--;
      // if we didn't call the onwrite immediately, then
      // it means that we need to wait until it does.
      // also, that means that the chunk and cb are currently
      // being processed, so move the buffer counter past them.
      if (state.writing) {
        break;
      }
    }

    if (entry === null) state.lastBufferedRequest = null;
  }

  state.bufferedRequest = entry;
  state.bufferProcessing = false;
}

Writable.prototype._write = function (chunk, encoding, cb) {
  cb(new Error('_write() is not implemented'));
};

Writable.prototype._writev = null;

Writable.prototype.end = function (chunk, encoding, cb) {
  var state = this._writableState;

  if (typeof chunk === 'function') {
    cb = chunk;
    chunk = null;
    encoding = null;
  } else if (typeof encoding === 'function') {
    cb = encoding;
    encoding = null;
  }

  if (chunk !== null && chunk !== undefined) this.write(chunk, encoding);

  // .end() fully uncorks
  if (state.corked) {
    state.corked = 1;
    this.uncork();
  }

  // ignore unnecessary end() calls.
  if (!state.ending && !state.finished) endWritable(this, state, cb);
};

function needFinish(state) {
  return state.ending && state.length === 0 && state.bufferedRequest === null && !state.finished && !state.writing;
}
function callFinal(stream, state) {
  stream._final(function (err) {
    state.pendingcb--;
    if (err) {
      stream.emit('error', err);
    }
    state.prefinished = true;
    stream.emit('prefinish');
    finishMaybe(stream, state);
  });
}
function prefinish(stream, state) {
  if (!state.prefinished && !state.finalCalled) {
    if (typeof stream._final === 'function') {
      state.pendingcb++;
      state.finalCalled = true;
      pna.nextTick(callFinal, stream, state);
    } else {
      state.prefinished = true;
      stream.emit('prefinish');
    }
  }
}

function finishMaybe(stream, state) {
  var need = needFinish(state);
  if (need) {
    prefinish(stream, state);
    if (state.pendingcb === 0) {
      state.finished = true;
      stream.emit('finish');
    }
  }
  return need;
}

function endWritable(stream, state, cb) {
  state.ending = true;
  finishMaybe(stream, state);
  if (cb) {
    if (state.finished) pna.nextTick(cb);else stream.once('finish', cb);
  }
  state.ended = true;
  stream.writable = false;
}

function onCorkedFinish(corkReq, state, err) {
  var entry = corkReq.entry;
  corkReq.entry = null;
  while (entry) {
    var cb = entry.callback;
    state.pendingcb--;
    cb(err);
    entry = entry.next;
  }
  if (state.corkedRequestsFree) {
    state.corkedRequestsFree.next = corkReq;
  } else {
    state.corkedRequestsFree = corkReq;
  }
}

Object.defineProperty(Writable.prototype, 'destroyed', {
  get: function () {
    if (this._writableState === undefined) {
      return false;
    }
    return this._writableState.destroyed;
  },
  set: function (value) {
    // we ignore the value if the stream
    // has not been initialized yet
    if (!this._writableState) {
      return;
    }

    // backward compatibility, the user is explicitly
    // managing destroyed
    this._writableState.destroyed = value;
  }
});

Writable.prototype.destroy = destroyImpl.destroy;
Writable.prototype._undestroy = destroyImpl.undestroy;
Writable.prototype._destroy = function (err, cb) {
  this.end();
  cb(err);
};
}).call(this,require('_process'),typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("timers").setImmediate)
},{"./_stream_duplex":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/readable-stream/lib/_stream_duplex.js","./internal/streams/destroy":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/readable-stream/lib/internal/streams/destroy.js","./internal/streams/stream":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/readable-stream/lib/internal/streams/stream-browser.js","_process":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/process/browser.js","core-util-is":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/core-util-is/lib/util.js","inherits":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/inherits/inherits_browser.js","process-nextick-args":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/process-nextick-args/index.js","safe-buffer":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/safe-buffer/index.js","timers":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/timers-browserify/main.js","util-deprecate":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/util-deprecate/browser.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/readable-stream/lib/internal/streams/BufferList.js":[function(require,module,exports){
'use strict';

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var Buffer = require('safe-buffer').Buffer;
var util = require('util');

function copyBuffer(src, target, offset) {
  src.copy(target, offset);
}

module.exports = function () {
  function BufferList() {
    _classCallCheck(this, BufferList);

    this.head = null;
    this.tail = null;
    this.length = 0;
  }

  BufferList.prototype.push = function push(v) {
    var entry = { data: v, next: null };
    if (this.length > 0) this.tail.next = entry;else this.head = entry;
    this.tail = entry;
    ++this.length;
  };

  BufferList.prototype.unshift = function unshift(v) {
    var entry = { data: v, next: this.head };
    if (this.length === 0) this.tail = entry;
    this.head = entry;
    ++this.length;
  };

  BufferList.prototype.shift = function shift() {
    if (this.length === 0) return;
    var ret = this.head.data;
    if (this.length === 1) this.head = this.tail = null;else this.head = this.head.next;
    --this.length;
    return ret;
  };

  BufferList.prototype.clear = function clear() {
    this.head = this.tail = null;
    this.length = 0;
  };

  BufferList.prototype.join = function join(s) {
    if (this.length === 0) return '';
    var p = this.head;
    var ret = '' + p.data;
    while (p = p.next) {
      ret += s + p.data;
    }return ret;
  };

  BufferList.prototype.concat = function concat(n) {
    if (this.length === 0) return Buffer.alloc(0);
    if (this.length === 1) return this.head.data;
    var ret = Buffer.allocUnsafe(n >>> 0);
    var p = this.head;
    var i = 0;
    while (p) {
      copyBuffer(p.data, ret, i);
      i += p.data.length;
      p = p.next;
    }
    return ret;
  };

  return BufferList;
}();

if (util && util.inspect && util.inspect.custom) {
  module.exports.prototype[util.inspect.custom] = function () {
    var obj = util.inspect({ length: this.length });
    return this.constructor.name + ' ' + obj;
  };
}
},{"safe-buffer":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/safe-buffer/index.js","util":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/browser-resolve/empty.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/readable-stream/lib/internal/streams/destroy.js":[function(require,module,exports){
'use strict';

/*<replacement>*/

var pna = require('process-nextick-args');
/*</replacement>*/

// undocumented cb() API, needed for core, not for public API
function destroy(err, cb) {
  var _this = this;

  var readableDestroyed = this._readableState && this._readableState.destroyed;
  var writableDestroyed = this._writableState && this._writableState.destroyed;

  if (readableDestroyed || writableDestroyed) {
    if (cb) {
      cb(err);
    } else if (err && (!this._writableState || !this._writableState.errorEmitted)) {
      pna.nextTick(emitErrorNT, this, err);
    }
    return this;
  }

  // we set destroyed to true before firing error callbacks in order
  // to make it re-entrance safe in case destroy() is called within callbacks

  if (this._readableState) {
    this._readableState.destroyed = true;
  }

  // if this is a duplex stream mark the writable part as destroyed as well
  if (this._writableState) {
    this._writableState.destroyed = true;
  }

  this._destroy(err || null, function (err) {
    if (!cb && err) {
      pna.nextTick(emitErrorNT, _this, err);
      if (_this._writableState) {
        _this._writableState.errorEmitted = true;
      }
    } else if (cb) {
      cb(err);
    }
  });

  return this;
}

function undestroy() {
  if (this._readableState) {
    this._readableState.destroyed = false;
    this._readableState.reading = false;
    this._readableState.ended = false;
    this._readableState.endEmitted = false;
  }

  if (this._writableState) {
    this._writableState.destroyed = false;
    this._writableState.ended = false;
    this._writableState.ending = false;
    this._writableState.finished = false;
    this._writableState.errorEmitted = false;
  }
}

function emitErrorNT(self, err) {
  self.emit('error', err);
}

module.exports = {
  destroy: destroy,
  undestroy: undestroy
};
},{"process-nextick-args":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/process-nextick-args/index.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/readable-stream/lib/internal/streams/stream-browser.js":[function(require,module,exports){
arguments[4]["/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hyperswarm-proxy/node_modules/readable-stream/lib/internal/streams/stream-browser.js"][0].apply(exports,arguments)
},{"events":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/browserify/node_modules/events/events.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/readable-stream/passthrough.js":[function(require,module,exports){
module.exports = require('./readable').PassThrough

},{"./readable":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/readable-stream/readable-browser.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/readable-stream/readable-browser.js":[function(require,module,exports){
exports = module.exports = require('./lib/_stream_readable.js');
exports.Stream = exports;
exports.Readable = exports;
exports.Writable = require('./lib/_stream_writable.js');
exports.Duplex = require('./lib/_stream_duplex.js');
exports.Transform = require('./lib/_stream_transform.js');
exports.PassThrough = require('./lib/_stream_passthrough.js');

},{"./lib/_stream_duplex.js":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/readable-stream/lib/_stream_duplex.js","./lib/_stream_passthrough.js":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/readable-stream/lib/_stream_passthrough.js","./lib/_stream_readable.js":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/readable-stream/lib/_stream_readable.js","./lib/_stream_transform.js":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/readable-stream/lib/_stream_transform.js","./lib/_stream_writable.js":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/readable-stream/lib/_stream_writable.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/readable-stream/transform.js":[function(require,module,exports){
module.exports = require('./readable').Transform

},{"./readable":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/readable-stream/readable-browser.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/readable-stream/writable-browser.js":[function(require,module,exports){
module.exports = require('./lib/_stream_writable.js');

},{"./lib/_stream_writable.js":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/readable-stream/lib/_stream_writable.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/safe-buffer/index.js":[function(require,module,exports){
/* eslint-disable node/no-deprecated-api */
var buffer = require('buffer')
var Buffer = buffer.Buffer

// alternative to using Object.keys for old browsers
function copyProps (src, dst) {
  for (var key in src) {
    dst[key] = src[key]
  }
}
if (Buffer.from && Buffer.alloc && Buffer.allocUnsafe && Buffer.allocUnsafeSlow) {
  module.exports = buffer
} else {
  // Copy properties from require('buffer')
  copyProps(buffer, exports)
  exports.Buffer = SafeBuffer
}

function SafeBuffer (arg, encodingOrOffset, length) {
  return Buffer(arg, encodingOrOffset, length)
}

// Copy static methods from Buffer
copyProps(Buffer, SafeBuffer)

SafeBuffer.from = function (arg, encodingOrOffset, length) {
  if (typeof arg === 'number') {
    throw new TypeError('Argument must not be a number')
  }
  return Buffer(arg, encodingOrOffset, length)
}

SafeBuffer.alloc = function (size, fill, encoding) {
  if (typeof size !== 'number') {
    throw new TypeError('Argument must be a number')
  }
  var buf = Buffer(size)
  if (fill !== undefined) {
    if (typeof encoding === 'string') {
      buf.fill(fill, encoding)
    } else {
      buf.fill(fill)
    }
  } else {
    buf.fill(0)
  }
  return buf
}

SafeBuffer.allocUnsafe = function (size) {
  if (typeof size !== 'number') {
    throw new TypeError('Argument must be a number')
  }
  return Buffer(size)
}

SafeBuffer.allocUnsafeSlow = function (size) {
  if (typeof size !== 'number') {
    throw new TypeError('Argument must be a number')
  }
  return buffer.SlowBuffer(size)
}

},{"buffer":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/buffer/index.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/signed-varint/index.js":[function(require,module,exports){
var varint = require('varint')
exports.encode = function encode (v, b, o) {
  v = v >= 0 ? v*2 : v*-2 - 1
  var r = varint.encode(v, b, o)
  encode.bytes = varint.encode.bytes
  return r
}
exports.decode = function decode (b, o) {
  var v = varint.decode(b, o)
  decode.bytes = varint.decode.bytes
  return v & 1 ? (v+1) / -2 : v / 2
}

exports.encodingLength = function (v) {
  return varint.encodingLength(v >= 0 ? v*2 : v*-2 - 1)
}

},{"varint":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/signed-varint/node_modules/varint/index.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/signed-varint/node_modules/varint/decode.js":[function(require,module,exports){
arguments[4]["/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hypercore-protocol/node_modules/varint/decode.js"][0].apply(exports,arguments)
},{}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/signed-varint/node_modules/varint/encode.js":[function(require,module,exports){
arguments[4]["/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hypercore-protocol/node_modules/varint/encode.js"][0].apply(exports,arguments)
},{}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/signed-varint/node_modules/varint/index.js":[function(require,module,exports){
arguments[4]["/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hypercore-protocol/node_modules/varint/index.js"][0].apply(exports,arguments)
},{"./decode.js":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/signed-varint/node_modules/varint/decode.js","./encode.js":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/signed-varint/node_modules/varint/encode.js","./length.js":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/signed-varint/node_modules/varint/length.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/signed-varint/node_modules/varint/length.js":[function(require,module,exports){
arguments[4]["/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hypercore-protocol/node_modules/varint/length.js"][0].apply(exports,arguments)
},{}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/siphash24/fallback.js":[function(require,module,exports){
module.exports = fallback

function _add (a, b) {
  var rl = a.l + b.l
  var a2 = {
    h: a.h + b.h + (rl / 2 >>> 31) >>> 0,
    l: rl >>> 0
  }
  a.h = a2.h
  a.l = a2.l
}

function _xor (a, b) {
  a.h ^= b.h
  a.h >>>= 0
  a.l ^= b.l
  a.l >>>= 0
}

function _rotl (a, n) {
  var a2 = {
    h: a.h << n | a.l >>> (32 - n),
    l: a.l << n | a.h >>> (32 - n)
  }
  a.h = a2.h
  a.l = a2.l
}

function _rotl32 (a) {
  var al = a.l
  a.l = a.h
  a.h = al
}

function _compress (v0, v1, v2, v3) {
  _add(v0, v1)
  _add(v2, v3)
  _rotl(v1, 13)
  _rotl(v3, 16)
  _xor(v1, v0)
  _xor(v3, v2)
  _rotl32(v0)
  _add(v2, v1)
  _add(v0, v3)
  _rotl(v1, 17)
  _rotl(v3, 21)
  _xor(v1, v2)
  _xor(v3, v0)
  _rotl32(v2)
}

function _get_int (a, offset) {
  return (a[offset + 3] << 24) | (a[offset + 2] << 16) | (a[offset + 1] << 8) | a[offset]
}

function fallback (out, m, key) { // modified from https://github.com/jedisct1/siphash-js to use uint8arrays
  var k0 = {h: _get_int(key, 4), l: _get_int(key, 0)}
  var k1 = {h: _get_int(key, 12), l: _get_int(key, 8)}
  var v0 = {h: k0.h, l: k0.l}
  var v2 = k0
  var v1 = {h: k1.h, l: k1.l}
  var v3 = k1
  var mi
  var mp = 0
  var ml = m.length
  var ml7 = ml - 7
  var buf = new Uint8Array(new ArrayBuffer(8))

  _xor(v0, {h: 0x736f6d65, l: 0x70736575})
  _xor(v1, {h: 0x646f7261, l: 0x6e646f6d})
  _xor(v2, {h: 0x6c796765, l: 0x6e657261})
  _xor(v3, {h: 0x74656462, l: 0x79746573})

  while (mp < ml7) {
    mi = {h: _get_int(m, mp + 4), l: _get_int(m, mp)}
    _xor(v3, mi)
    _compress(v0, v1, v2, v3)
    _compress(v0, v1, v2, v3)
    _xor(v0, mi)
    mp += 8
  }

  buf[7] = ml
  var ic = 0
  while (mp < ml) {
    buf[ic++] = m[mp++]
  }
  while (ic < 7) {
    buf[ic++] = 0
  }

  mi = {
    h: buf[7] << 24 | buf[6] << 16 | buf[5] << 8 | buf[4],
    l: buf[3] << 24 | buf[2] << 16 | buf[1] << 8 | buf[0]
  }

  _xor(v3, mi)
  _compress(v0, v1, v2, v3)
  _compress(v0, v1, v2, v3)
  _xor(v0, mi)
  _xor(v2, { h: 0, l: 0xff })
  _compress(v0, v1, v2, v3)
  _compress(v0, v1, v2, v3)
  _compress(v0, v1, v2, v3)
  _compress(v0, v1, v2, v3)

  var h = v0
  _xor(h, v1)
  _xor(h, v2)
  _xor(h, v3)

  out[0] = h.l & 0xff
  out[1] = (h.l >> 8) & 0xff
  out[2] = (h.l >> 16) & 0xff
  out[3] = (h.l >> 24) & 0xff
  out[4] = h.h & 0xff
  out[5] = (h.h >> 8) & 0xff
  out[6] = (h.h >> 16) & 0xff
  out[7] = (h.h >> 24) & 0xff
}

},{}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/siphash24/index.js":[function(require,module,exports){
var wasm = require('./siphash24')
var fallback = require('./fallback')
var assert = require('nanoassert')

module.exports = siphash24

var BYTES = siphash24.BYTES = 8
var KEYBYTES = siphash24.KEYBYTES = 16
var mod = wasm()

siphash24.WASM_SUPPORTED = typeof WebAssembly !== 'undefined'
siphash24.WASM_LOADED = false

if (mod) {
  mod.onload(function (err) {
    siphash24.WASM_LOADED = !err
  })
}

function siphash24 (data, key, out, noAssert) {
  if (!out) out = new Uint8Array(8)

  if (noAssert !== true) {
    assert(out.length >= BYTES, 'output must be at least ' + BYTES)
    assert(key.length >= KEYBYTES, 'key must be at least ' + KEYBYTES)
  }

  if (mod && mod.exports) {
    if (data.length + 24 > mod.memory.length) mod.realloc(data.length + 24)
    mod.memory.set(key, 8)
    mod.memory.set(data, 24)
    mod.exports.siphash(24, data.length)
    out.set(mod.memory.subarray(0, 8))
  } else {
    fallback(out, data, key)
  }

  return out
}

},{"./fallback":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/siphash24/fallback.js","./siphash24":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/siphash24/siphash24.js","nanoassert":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/nanoassert/index.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/siphash24/siphash24.js":[function(require,module,exports){

module.exports = loadWebAssembly

loadWebAssembly.supported = typeof WebAssembly !== 'undefined'

function loadWebAssembly (opts) {
  if (!loadWebAssembly.supported) return null

  var imp = opts && opts.imports
  var wasm = toUint8Array('AGFzbQEAAAABBgFgAn9/AAMCAQAFBQEBCpBOBxQCBm1lbW9yeQIAB3NpcGhhc2gAAArdCAHaCAIIfgJ/QvXKzYPXrNu38wAhAkLt3pHzlszct+QAIQNC4eSV89bs2bzsACEEQvPK0cunjNmy9AAhBUEIKQMAIQdBECkDACEIIAGtQjiGIQYgAUEHcSELIAAgAWogC2shCiAFIAiFIQUgBCAHhSEEIAMgCIUhAyACIAeFIQICQANAIAAgCkYNASAAKQMAIQkgBSAJhSEFIAIgA3whAiADQg2JIQMgAyAChSEDIAJCIIkhAiAEIAV8IQQgBUIQiSEFIAUgBIUhBSACIAV8IQIgBUIViSEFIAUgAoUhBSAEIAN8IQQgA0IRiSEDIAMgBIUhAyAEQiCJIQQgAiADfCECIANCDYkhAyADIAKFIQMgAkIgiSECIAQgBXwhBCAFQhCJIQUgBSAEhSEFIAIgBXwhAiAFQhWJIQUgBSAChSEFIAQgA3whBCADQhGJIQMgAyAEhSEDIARCIIkhBCACIAmFIQIgAEEIaiEADAALCwJAAkACQAJAAkACQAJAAkAgCw4HBwYFBAMCAQALIAYgADEABkIwhoQhBgsgBiAAMQAFQiiGhCEGCyAGIAAxAARCIIaEIQYLIAYgADEAA0IYhoQhBgsgBiAAMQACQhCGhCEGCyAGIAAxAAFCCIaEIQYLIAYgADEAAIQhBgsgBSAGhSEFIAIgA3whAiADQg2JIQMgAyAChSEDIAJCIIkhAiAEIAV8IQQgBUIQiSEFIAUgBIUhBSACIAV8IQIgBUIViSEFIAUgAoUhBSAEIAN8IQQgA0IRiSEDIAMgBIUhAyAEQiCJIQQgAiADfCECIANCDYkhAyADIAKFIQMgAkIgiSECIAQgBXwhBCAFQhCJIQUgBSAEhSEFIAIgBXwhAiAFQhWJIQUgBSAChSEFIAQgA3whBCADQhGJIQMgAyAEhSEDIARCIIkhBCACIAaFIQIgBEL/AYUhBCACIAN8IQIgA0INiSEDIAMgAoUhAyACQiCJIQIgBCAFfCEEIAVCEIkhBSAFIASFIQUgAiAFfCECIAVCFYkhBSAFIAKFIQUgBCADfCEEIANCEYkhAyADIASFIQMgBEIgiSEEIAIgA3whAiADQg2JIQMgAyAChSEDIAJCIIkhAiAEIAV8IQQgBUIQiSEFIAUgBIUhBSACIAV8IQIgBUIViSEFIAUgAoUhBSAEIAN8IQQgA0IRiSEDIAMgBIUhAyAEQiCJIQQgAiADfCECIANCDYkhAyADIAKFIQMgAkIgiSECIAQgBXwhBCAFQhCJIQUgBSAEhSEFIAIgBXwhAiAFQhWJIQUgBSAChSEFIAQgA3whBCADQhGJIQMgAyAEhSEDIARCIIkhBCACIAN8IQIgA0INiSEDIAMgAoUhAyACQiCJIQIgBCAFfCEEIAVCEIkhBSAFIASFIQUgAiAFfCECIAVCFYkhBSAFIAKFIQUgBCADfCEEIANCEYkhAyADIASFIQMgBEIgiSEEQQAgAiADIAQgBYWFhTcDAAs=')
  var ready = null

  var mod = {
    buffer: wasm,
    memory: null,
    exports: null,
    realloc: realloc,
    onload: onload
  }

  onload(function () {})

  return mod

  function realloc (size) {
    mod.exports.memory.grow(Math.max(0, Math.ceil(Math.abs(size - mod.memory.length) / 65536)))
    mod.memory = new Uint8Array(mod.exports.memory.buffer)
  }

  function onload (cb) {
    if (mod.exports) return cb()

    if (ready) {
      ready.then(cb.bind(null, null)).catch(cb)
      return
    }

    try {
      if (opts && opts.async) throw new Error('async')
      setup({instance: new WebAssembly.Instance(new WebAssembly.Module(wasm), imp)})
    } catch (err) {
      ready = WebAssembly.instantiate(wasm, imp).then(setup)
    }

    onload(cb)
  }

  function setup (w) {
    mod.exports = w.instance.exports
    mod.memory = mod.exports.memory && mod.exports.memory.buffer && new Uint8Array(mod.exports.memory.buffer)
  }
}

function toUint8Array (s) {
  if (typeof atob === 'function') return new Uint8Array(atob(s).split('').map(charCodeAt))
  return new (require('buf' + 'fer').Buffer)(s, 'base64')
}

function charCodeAt (c) {
  return c.charCodeAt(0)
}

},{}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/sodium-javascript/crypto_generichash.js":[function(require,module,exports){
var blake2b = require('blake2b')

module.exports.crypto_generichash_PRIMITIVE = 'blake2b'
module.exports.crypto_generichash_BYTES_MIN = blake2b.BYTES_MIN
module.exports.crypto_generichash_BYTES_MAX = blake2b.BYTES_MAX
module.exports.crypto_generichash_BYTES = blake2b.BYTES
module.exports.crypto_generichash_KEYBYTES_MIN = blake2b.KEYBYTES_MIN
module.exports.crypto_generichash_KEYBYTES_MAX = blake2b.KEYBYTES_MAX
module.exports.crypto_generichash_KEYBYTES = blake2b.KEYBYTES
module.exports.crypto_generichash_WASM_SUPPORTED = blake2b.WASM_SUPPORTED
module.exports.crypto_generichash_WASM_LOADED = false

module.exports.crypto_generichash = function (output, input, key) {
  blake2b(output.length, key).update(input).final(output)
}

module.exports.crypto_generichash_ready = blake2b.ready

module.exports.crypto_generichash_batch = function (output, inputArray, key) {
  var ctx = blake2b(output.length, key)
  for (var i = 0; i < inputArray.length; i++) {
    ctx.update(inputArray[i])
  }
  ctx.final(output)
}

module.exports.crypto_generichash_instance = function (key, outlen) {
  if (outlen == null) outlen = module.exports.crypto_generichash_BYTES
  return blake2b(outlen, key)
}

blake2b.ready(function (err) {
  module.exports.crypto_generichash_WASM_LOADED = blake2b.WASM_LOADED
})

},{"blake2b":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/blake2b/index.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/sodium-javascript/crypto_kdf.js":[function(require,module,exports){
var assert = require('nanoassert')
var randombytes_buf = require('./randombytes').randombytes_buf
var blake2b = require('blake2b')

module.exports.crypto_kdf_PRIMITIVE = 'blake2b'
module.exports.crypto_kdf_BYTES_MIN = 16
module.exports.crypto_kdf_BYTES_MAX = 64
module.exports.crypto_kdf_CONTEXTBYTES = 8
module.exports.crypto_kdf_KEYBYTES = 32

function STORE64_LE(dest, int) {
  var mul = 1
  var i = 0
  dest[0] = int & 0xFF
  while (++i < 8 && (mul *= 0x100)) {
    dest[i] = (int / mul) & 0xFF
  }
}

module.exports.crypto_kdf_derive_from_key = function crypto_kdf_derive_from_key (subkey, subkey_id, ctx, key) {
  assert(subkey.length >= module.exports.crypto_kdf_BYTES_MIN, 'subkey must be at least crypto_kdf_BYTES_MIN')
  assert(subkey_id >= 0 && subkey_id <= 0x1fffffffffffff, 'subkey_id must be safe integer')
  assert(ctx.length >= module.exports.crypto_kdf_CONTEXTBYTES, 'context must be at least crypto_kdf_CONTEXTBYTES')

  var ctx_padded = new Uint8Array(blake2b.PERSONALBYTES)
  var salt = new Uint8Array(blake2b.SALTBYTES)

  ctx_padded.set(ctx, 0, module.exports.crypto_kdf_CONTEXTBYTES)
  STORE64_LE(salt, subkey_id)

  var outlen = Math.min(subkey.length, module.exports.crypto_kdf_BYTES_MAX)
  blake2b(outlen, key.subarray(0, module.exports.crypto_kdf_KEYBYTES), salt, ctx_padded, true)
    .final(subkey)
}

module.exports.crypto_kdf_keygen = function crypto_kdf_keygen (out) {
  assert(out.length >= module.exports.crypto_kdf_KEYBYTES, 'out.length must be crypto_kdf_KEYBYTES')
  randombytes_buf(out.subarray(0, module.exports.crypto_kdf_KEYBYTES))
}

},{"./randombytes":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/sodium-javascript/randombytes.js","blake2b":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/blake2b/index.js","nanoassert":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/nanoassert/index.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/sodium-javascript/crypto_shorthash.js":[function(require,module,exports){
var siphash = require('siphash24')

exports.crypto_shorthash_PRIMITIVE = 'siphash24'
exports.crypto_shorthash_BYTES = siphash.BYTES
exports.crypto_shorthash_KEYBYTES = siphash.KEYBYTES
exports.crypto_shorthash_WASM_SUPPORTED = siphash.WASM_SUPPORTED
exports.crypto_shorthash_WASM_LOADED = siphash.WASM_LOADED
exports.crypto_shorthash = shorthash

function shorthash (out, data, key, noAssert) {
  siphash(data, key, out, noAssert)
}

},{"siphash24":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/siphash24/index.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/sodium-javascript/crypto_stream.js":[function(require,module,exports){
var xsalsa20 = require('xsalsa20')

exports.crypto_stream_KEYBYTES = 32
exports.crypto_stream_NONCEBYTES = 24
exports.crypto_stream_PRIMITIVE = 'xsalsa20'

exports.crypto_stream = function (out, nonce, key) {
  out.fill(0)
  exports.crypto_stream_xor(out, out, nonce, key)
}

exports.crypto_stream_xor = function (out, inp, nonce, key) {
  var xor = xsalsa20(nonce, key)
  xor.update(inp, out)
  xor.final()
}

exports.crypto_stream_xor_instance = function (nonce, key) {
  return new XOR(nonce, key)
}

function XOR (nonce, key) {
  this._instance = xsalsa20(nonce, key)
}

XOR.prototype.update = function (out, inp) {
  this._instance.update(inp, out)
}

XOR.prototype.final = function () {
  this._instance.finalize()
  this._instance = null
}

},{"xsalsa20":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/xsalsa20/index.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/sodium-javascript/index.js":[function(require,module,exports){
'use strict';

// Based on https://github.com/dchest/tweetnacl-js/blob/6dcbcaf5f5cbfd313f2dcfe763db35c828c8ff5b/nacl-fast.js.

var sodium = module.exports
var cs = require('./crypto_stream')

// Ported in 2014 by Dmitry Chestnykh and Devi Mandiri.
// Public domain.
//
// Implementation derived from TweetNaCl version 20140427.
// See for details: http://tweetnacl.cr.yp.to/

var gf = function(init) {
  var i, r = new Float64Array(16);
  if (init) for (i = 0; i < init.length; i++) r[i] = init[i];
  return r;
};

// also forwarded at the bottom but randombytes is non-enumerable
var randombytes = require('./randombytes').randombytes

var _0 = new Uint8Array(16);
var _9 = new Uint8Array(32); _9[0] = 9;

var gf0 = gf(),
    gf1 = gf([1]),
    _121665 = gf([0xdb41, 1]),
    D = gf([0x78a3, 0x1359, 0x4dca, 0x75eb, 0xd8ab, 0x4141, 0x0a4d, 0x0070, 0xe898, 0x7779, 0x4079, 0x8cc7, 0xfe73, 0x2b6f, 0x6cee, 0x5203]),
    D2 = gf([0xf159, 0x26b2, 0x9b94, 0xebd6, 0xb156, 0x8283, 0x149a, 0x00e0, 0xd130, 0xeef3, 0x80f2, 0x198e, 0xfce7, 0x56df, 0xd9dc, 0x2406]),
    X = gf([0xd51a, 0x8f25, 0x2d60, 0xc956, 0xa7b2, 0x9525, 0xc760, 0x692c, 0xdc5c, 0xfdd6, 0xe231, 0xc0a4, 0x53fe, 0xcd6e, 0x36d3, 0x2169]),
    Y = gf([0x6658, 0x6666, 0x6666, 0x6666, 0x6666, 0x6666, 0x6666, 0x6666, 0x6666, 0x6666, 0x6666, 0x6666, 0x6666, 0x6666, 0x6666, 0x6666]),
    I = gf([0xa0b0, 0x4a0e, 0x1b27, 0xc4ee, 0xe478, 0xad2f, 0x1806, 0x2f43, 0xd7a7, 0x3dfb, 0x0099, 0x2b4d, 0xdf0b, 0x4fc1, 0x2480, 0x2b83]);

function ts64(x, i, h, l) {
  x[i]   = (h >> 24) & 0xff;
  x[i+1] = (h >> 16) & 0xff;
  x[i+2] = (h >>  8) & 0xff;
  x[i+3] = h & 0xff;
  x[i+4] = (l >> 24)  & 0xff;
  x[i+5] = (l >> 16)  & 0xff;
  x[i+6] = (l >>  8)  & 0xff;
  x[i+7] = l & 0xff;
}

function vn(x, xi, y, yi, n) {
  var i,d = 0;
  for (i = 0; i < n; i++) d |= x[xi+i]^y[yi+i];
  return (1 & ((d - 1) >>> 8)) - 1;
}

function crypto_verify_16(x, xi, y, yi) {
  return vn(x,xi,y,yi,16);
}

function crypto_verify_32(x, xi, y, yi) {
  return vn(x,xi,y,yi,32);
}

/*
* Port of Andrew Moon's Poly1305-donna-16. Public domain.
* https://github.com/floodyberry/poly1305-donna
*/

var poly1305 = function(key) {
  this.buffer = new Uint8Array(16);
  this.r = new Uint16Array(10);
  this.h = new Uint16Array(10);
  this.pad = new Uint16Array(8);
  this.leftover = 0;
  this.fin = 0;

  var t0, t1, t2, t3, t4, t5, t6, t7;

  t0 = key[ 0] & 0xff | (key[ 1] & 0xff) << 8; this.r[0] = ( t0                     ) & 0x1fff;
  t1 = key[ 2] & 0xff | (key[ 3] & 0xff) << 8; this.r[1] = ((t0 >>> 13) | (t1 <<  3)) & 0x1fff;
  t2 = key[ 4] & 0xff | (key[ 5] & 0xff) << 8; this.r[2] = ((t1 >>> 10) | (t2 <<  6)) & 0x1f03;
  t3 = key[ 6] & 0xff | (key[ 7] & 0xff) << 8; this.r[3] = ((t2 >>>  7) | (t3 <<  9)) & 0x1fff;
  t4 = key[ 8] & 0xff | (key[ 9] & 0xff) << 8; this.r[4] = ((t3 >>>  4) | (t4 << 12)) & 0x00ff;
  this.r[5] = ((t4 >>>  1)) & 0x1ffe;
  t5 = key[10] & 0xff | (key[11] & 0xff) << 8; this.r[6] = ((t4 >>> 14) | (t5 <<  2)) & 0x1fff;
  t6 = key[12] & 0xff | (key[13] & 0xff) << 8; this.r[7] = ((t5 >>> 11) | (t6 <<  5)) & 0x1f81;
  t7 = key[14] & 0xff | (key[15] & 0xff) << 8; this.r[8] = ((t6 >>>  8) | (t7 <<  8)) & 0x1fff;
  this.r[9] = ((t7 >>>  5)) & 0x007f;

  this.pad[0] = key[16] & 0xff | (key[17] & 0xff) << 8;
  this.pad[1] = key[18] & 0xff | (key[19] & 0xff) << 8;
  this.pad[2] = key[20] & 0xff | (key[21] & 0xff) << 8;
  this.pad[3] = key[22] & 0xff | (key[23] & 0xff) << 8;
  this.pad[4] = key[24] & 0xff | (key[25] & 0xff) << 8;
  this.pad[5] = key[26] & 0xff | (key[27] & 0xff) << 8;
  this.pad[6] = key[28] & 0xff | (key[29] & 0xff) << 8;
  this.pad[7] = key[30] & 0xff | (key[31] & 0xff) << 8;
};

poly1305.prototype.blocks = function(m, mpos, bytes) {
  var hibit = this.fin ? 0 : (1 << 11);
  var t0, t1, t2, t3, t4, t5, t6, t7, c;
  var d0, d1, d2, d3, d4, d5, d6, d7, d8, d9;

  var h0 = this.h[0],
      h1 = this.h[1],
      h2 = this.h[2],
      h3 = this.h[3],
      h4 = this.h[4],
      h5 = this.h[5],
      h6 = this.h[6],
      h7 = this.h[7],
      h8 = this.h[8],
      h9 = this.h[9];

  var r0 = this.r[0],
      r1 = this.r[1],
      r2 = this.r[2],
      r3 = this.r[3],
      r4 = this.r[4],
      r5 = this.r[5],
      r6 = this.r[6],
      r7 = this.r[7],
      r8 = this.r[8],
      r9 = this.r[9];

  while (bytes >= 16) {
    t0 = m[mpos+ 0] & 0xff | (m[mpos+ 1] & 0xff) << 8; h0 += ( t0                     ) & 0x1fff;
    t1 = m[mpos+ 2] & 0xff | (m[mpos+ 3] & 0xff) << 8; h1 += ((t0 >>> 13) | (t1 <<  3)) & 0x1fff;
    t2 = m[mpos+ 4] & 0xff | (m[mpos+ 5] & 0xff) << 8; h2 += ((t1 >>> 10) | (t2 <<  6)) & 0x1fff;
    t3 = m[mpos+ 6] & 0xff | (m[mpos+ 7] & 0xff) << 8; h3 += ((t2 >>>  7) | (t3 <<  9)) & 0x1fff;
    t4 = m[mpos+ 8] & 0xff | (m[mpos+ 9] & 0xff) << 8; h4 += ((t3 >>>  4) | (t4 << 12)) & 0x1fff;
    h5 += ((t4 >>>  1)) & 0x1fff;
    t5 = m[mpos+10] & 0xff | (m[mpos+11] & 0xff) << 8; h6 += ((t4 >>> 14) | (t5 <<  2)) & 0x1fff;
    t6 = m[mpos+12] & 0xff | (m[mpos+13] & 0xff) << 8; h7 += ((t5 >>> 11) | (t6 <<  5)) & 0x1fff;
    t7 = m[mpos+14] & 0xff | (m[mpos+15] & 0xff) << 8; h8 += ((t6 >>>  8) | (t7 <<  8)) & 0x1fff;
    h9 += ((t7 >>> 5)) | hibit;

    c = 0;

    d0 = c;
    d0 += h0 * r0;
    d0 += h1 * (5 * r9);
    d0 += h2 * (5 * r8);
    d0 += h3 * (5 * r7);
    d0 += h4 * (5 * r6);
    c = (d0 >>> 13); d0 &= 0x1fff;
    d0 += h5 * (5 * r5);
    d0 += h6 * (5 * r4);
    d0 += h7 * (5 * r3);
    d0 += h8 * (5 * r2);
    d0 += h9 * (5 * r1);
    c += (d0 >>> 13); d0 &= 0x1fff;

    d1 = c;
    d1 += h0 * r1;
    d1 += h1 * r0;
    d1 += h2 * (5 * r9);
    d1 += h3 * (5 * r8);
    d1 += h4 * (5 * r7);
    c = (d1 >>> 13); d1 &= 0x1fff;
    d1 += h5 * (5 * r6);
    d1 += h6 * (5 * r5);
    d1 += h7 * (5 * r4);
    d1 += h8 * (5 * r3);
    d1 += h9 * (5 * r2);
    c += (d1 >>> 13); d1 &= 0x1fff;

    d2 = c;
    d2 += h0 * r2;
    d2 += h1 * r1;
    d2 += h2 * r0;
    d2 += h3 * (5 * r9);
    d2 += h4 * (5 * r8);
    c = (d2 >>> 13); d2 &= 0x1fff;
    d2 += h5 * (5 * r7);
    d2 += h6 * (5 * r6);
    d2 += h7 * (5 * r5);
    d2 += h8 * (5 * r4);
    d2 += h9 * (5 * r3);
    c += (d2 >>> 13); d2 &= 0x1fff;

    d3 = c;
    d3 += h0 * r3;
    d3 += h1 * r2;
    d3 += h2 * r1;
    d3 += h3 * r0;
    d3 += h4 * (5 * r9);
    c = (d3 >>> 13); d3 &= 0x1fff;
    d3 += h5 * (5 * r8);
    d3 += h6 * (5 * r7);
    d3 += h7 * (5 * r6);
    d3 += h8 * (5 * r5);
    d3 += h9 * (5 * r4);
    c += (d3 >>> 13); d3 &= 0x1fff;

    d4 = c;
    d4 += h0 * r4;
    d4 += h1 * r3;
    d4 += h2 * r2;
    d4 += h3 * r1;
    d4 += h4 * r0;
    c = (d4 >>> 13); d4 &= 0x1fff;
    d4 += h5 * (5 * r9);
    d4 += h6 * (5 * r8);
    d4 += h7 * (5 * r7);
    d4 += h8 * (5 * r6);
    d4 += h9 * (5 * r5);
    c += (d4 >>> 13); d4 &= 0x1fff;

    d5 = c;
    d5 += h0 * r5;
    d5 += h1 * r4;
    d5 += h2 * r3;
    d5 += h3 * r2;
    d5 += h4 * r1;
    c = (d5 >>> 13); d5 &= 0x1fff;
    d5 += h5 * r0;
    d5 += h6 * (5 * r9);
    d5 += h7 * (5 * r8);
    d5 += h8 * (5 * r7);
    d5 += h9 * (5 * r6);
    c += (d5 >>> 13); d5 &= 0x1fff;

    d6 = c;
    d6 += h0 * r6;
    d6 += h1 * r5;
    d6 += h2 * r4;
    d6 += h3 * r3;
    d6 += h4 * r2;
    c = (d6 >>> 13); d6 &= 0x1fff;
    d6 += h5 * r1;
    d6 += h6 * r0;
    d6 += h7 * (5 * r9);
    d6 += h8 * (5 * r8);
    d6 += h9 * (5 * r7);
    c += (d6 >>> 13); d6 &= 0x1fff;

    d7 = c;
    d7 += h0 * r7;
    d7 += h1 * r6;
    d7 += h2 * r5;
    d7 += h3 * r4;
    d7 += h4 * r3;
    c = (d7 >>> 13); d7 &= 0x1fff;
    d7 += h5 * r2;
    d7 += h6 * r1;
    d7 += h7 * r0;
    d7 += h8 * (5 * r9);
    d7 += h9 * (5 * r8);
    c += (d7 >>> 13); d7 &= 0x1fff;

    d8 = c;
    d8 += h0 * r8;
    d8 += h1 * r7;
    d8 += h2 * r6;
    d8 += h3 * r5;
    d8 += h4 * r4;
    c = (d8 >>> 13); d8 &= 0x1fff;
    d8 += h5 * r3;
    d8 += h6 * r2;
    d8 += h7 * r1;
    d8 += h8 * r0;
    d8 += h9 * (5 * r9);
    c += (d8 >>> 13); d8 &= 0x1fff;

    d9 = c;
    d9 += h0 * r9;
    d9 += h1 * r8;
    d9 += h2 * r7;
    d9 += h3 * r6;
    d9 += h4 * r5;
    c = (d9 >>> 13); d9 &= 0x1fff;
    d9 += h5 * r4;
    d9 += h6 * r3;
    d9 += h7 * r2;
    d9 += h8 * r1;
    d9 += h9 * r0;
    c += (d9 >>> 13); d9 &= 0x1fff;

    c = (((c << 2) + c)) | 0;
    c = (c + d0) | 0;
    d0 = c & 0x1fff;
    c = (c >>> 13);
    d1 += c;

    h0 = d0;
    h1 = d1;
    h2 = d2;
    h3 = d3;
    h4 = d4;
    h5 = d5;
    h6 = d6;
    h7 = d7;
    h8 = d8;
    h9 = d9;

    mpos += 16;
    bytes -= 16;
  }
  this.h[0] = h0;
  this.h[1] = h1;
  this.h[2] = h2;
  this.h[3] = h3;
  this.h[4] = h4;
  this.h[5] = h5;
  this.h[6] = h6;
  this.h[7] = h7;
  this.h[8] = h8;
  this.h[9] = h9;
};

poly1305.prototype.finish = function(mac, macpos) {
  var g = new Uint16Array(10);
  var c, mask, f, i;

  if (this.leftover) {
    i = this.leftover;
    this.buffer[i++] = 1;
    for (; i < 16; i++) this.buffer[i] = 0;
    this.fin = 1;
    this.blocks(this.buffer, 0, 16);
  }

  c = this.h[1] >>> 13;
  this.h[1] &= 0x1fff;
  for (i = 2; i < 10; i++) {
    this.h[i] += c;
    c = this.h[i] >>> 13;
    this.h[i] &= 0x1fff;
  }
  this.h[0] += (c * 5);
  c = this.h[0] >>> 13;
  this.h[0] &= 0x1fff;
  this.h[1] += c;
  c = this.h[1] >>> 13;
  this.h[1] &= 0x1fff;
  this.h[2] += c;

  g[0] = this.h[0] + 5;
  c = g[0] >>> 13;
  g[0] &= 0x1fff;
  for (i = 1; i < 10; i++) {
    g[i] = this.h[i] + c;
    c = g[i] >>> 13;
    g[i] &= 0x1fff;
  }
  g[9] -= (1 << 13);

  mask = (c ^ 1) - 1;
  for (i = 0; i < 10; i++) g[i] &= mask;
  mask = ~mask;
  for (i = 0; i < 10; i++) this.h[i] = (this.h[i] & mask) | g[i];

  this.h[0] = ((this.h[0]       ) | (this.h[1] << 13)                    ) & 0xffff;
  this.h[1] = ((this.h[1] >>>  3) | (this.h[2] << 10)                    ) & 0xffff;
  this.h[2] = ((this.h[2] >>>  6) | (this.h[3] <<  7)                    ) & 0xffff;
  this.h[3] = ((this.h[3] >>>  9) | (this.h[4] <<  4)                    ) & 0xffff;
  this.h[4] = ((this.h[4] >>> 12) | (this.h[5] <<  1) | (this.h[6] << 14)) & 0xffff;
  this.h[5] = ((this.h[6] >>>  2) | (this.h[7] << 11)                    ) & 0xffff;
  this.h[6] = ((this.h[7] >>>  5) | (this.h[8] <<  8)                    ) & 0xffff;
  this.h[7] = ((this.h[8] >>>  8) | (this.h[9] <<  5)                    ) & 0xffff;

  f = this.h[0] + this.pad[0];
  this.h[0] = f & 0xffff;
  for (i = 1; i < 8; i++) {
    f = (((this.h[i] + this.pad[i]) | 0) + (f >>> 16)) | 0;
    this.h[i] = f & 0xffff;
  }

  mac[macpos+ 0] = (this.h[0] >>> 0) & 0xff;
  mac[macpos+ 1] = (this.h[0] >>> 8) & 0xff;
  mac[macpos+ 2] = (this.h[1] >>> 0) & 0xff;
  mac[macpos+ 3] = (this.h[1] >>> 8) & 0xff;
  mac[macpos+ 4] = (this.h[2] >>> 0) & 0xff;
  mac[macpos+ 5] = (this.h[2] >>> 8) & 0xff;
  mac[macpos+ 6] = (this.h[3] >>> 0) & 0xff;
  mac[macpos+ 7] = (this.h[3] >>> 8) & 0xff;
  mac[macpos+ 8] = (this.h[4] >>> 0) & 0xff;
  mac[macpos+ 9] = (this.h[4] >>> 8) & 0xff;
  mac[macpos+10] = (this.h[5] >>> 0) & 0xff;
  mac[macpos+11] = (this.h[5] >>> 8) & 0xff;
  mac[macpos+12] = (this.h[6] >>> 0) & 0xff;
  mac[macpos+13] = (this.h[6] >>> 8) & 0xff;
  mac[macpos+14] = (this.h[7] >>> 0) & 0xff;
  mac[macpos+15] = (this.h[7] >>> 8) & 0xff;
};

poly1305.prototype.update = function(m, mpos, bytes) {
  var i, want;

  if (this.leftover) {
    want = (16 - this.leftover);
    if (want > bytes)
      want = bytes;
    for (i = 0; i < want; i++)
      this.buffer[this.leftover + i] = m[mpos+i];
    bytes -= want;
    mpos += want;
    this.leftover += want;
    if (this.leftover < 16)
      return;
    this.blocks(this.buffer, 0, 16);
    this.leftover = 0;
  }

  if (bytes >= 16) {
    want = bytes - (bytes % 16);
    this.blocks(m, mpos, want);
    mpos += want;
    bytes -= want;
  }

  if (bytes) {
    for (i = 0; i < bytes; i++)
      this.buffer[this.leftover + i] = m[mpos+i];
    this.leftover += bytes;
  }
};

function crypto_stream_xor (c, cpos, m, mpos, clen, n, k) {
  cs.crypto_stream_xor(c, m, n, k)
}

function crypto_stream (c, cpos, clen, n, k) {
  cs.crypto_stream(c, n, k)
}

function crypto_onetimeauth(out, outpos, m, mpos, n, k) {
  var s = new poly1305(k);
  s.update(m, mpos, n);
  s.finish(out, outpos);
  return 0;
}

function crypto_onetimeauth_verify(h, hpos, m, mpos, n, k) {
  var x = new Uint8Array(16);
  crypto_onetimeauth(x,0,m,mpos,n,k);
  return crypto_verify_16(h,hpos,x,0);
}

function crypto_secretbox(c,m,d,n,k) {
  var i;
  if (d < 32) return -1;
  crypto_stream_xor(c,0,m,0,d,n,k);
  crypto_onetimeauth(c, 16, c, 32, d - 32, c);
  for (i = 0; i < 16; i++) c[i] = 0;
  return 0;
}

function crypto_secretbox_open(m,c,d,n,k) {
  var i;
  var x = new Uint8Array(32);
  if (d < 32) return -1;
  crypto_stream(x,0,32,n,k);
  if (crypto_onetimeauth_verify(c, 16,c, 32,d - 32,x) !== 0) return -1;
  crypto_stream_xor(m,0,c,0,d,n,k);
  for (i = 0; i < 32; i++) m[i] = 0;
  return 0;
}

function set25519(r, a) {
  var i;
  for (i = 0; i < 16; i++) r[i] = a[i]|0;
}

function car25519(o) {
  var i, v, c = 1;
  for (i = 0; i < 16; i++) {
    v = o[i] + c + 65535;
    c = Math.floor(v / 65536);
    o[i] = v - c * 65536;
  }
  o[0] += c-1 + 37 * (c-1);
}

function sel25519(p, q, b) {
  var t, c = ~(b-1);
  for (var i = 0; i < 16; i++) {
    t = c & (p[i] ^ q[i]);
    p[i] ^= t;
    q[i] ^= t;
  }
}

function pack25519(o, n) {
  var i, j, b;
  var m = gf(), t = gf();
  for (i = 0; i < 16; i++) t[i] = n[i];
  car25519(t);
  car25519(t);
  car25519(t);
  for (j = 0; j < 2; j++) {
    m[0] = t[0] - 0xffed;
    for (i = 1; i < 15; i++) {
      m[i] = t[i] - 0xffff - ((m[i-1]>>16) & 1);
      m[i-1] &= 0xffff;
    }
    m[15] = t[15] - 0x7fff - ((m[14]>>16) & 1);
    b = (m[15]>>16) & 1;
    m[14] &= 0xffff;
    sel25519(t, m, 1-b);
  }
  for (i = 0; i < 16; i++) {
    o[2*i] = t[i] & 0xff;
    o[2*i+1] = t[i]>>8;
  }
}

function neq25519(a, b) {
  var c = new Uint8Array(32), d = new Uint8Array(32);
  pack25519(c, a);
  pack25519(d, b);
  return crypto_verify_32(c, 0, d, 0);
}

function par25519(a) {
  var d = new Uint8Array(32);
  pack25519(d, a);
  return d[0] & 1;
}

function unpack25519(o, n) {
  var i;
  for (i = 0; i < 16; i++) o[i] = n[2*i] + (n[2*i+1] << 8);
  o[15] &= 0x7fff;
}

function A(o, a, b) {
  for (var i = 0; i < 16; i++) o[i] = a[i] + b[i];
}

function Z(o, a, b) {
  for (var i = 0; i < 16; i++) o[i] = a[i] - b[i];
}

function M(o, a, b) {
  var v, c,
     t0 = 0,  t1 = 0,  t2 = 0,  t3 = 0,  t4 = 0,  t5 = 0,  t6 = 0,  t7 = 0,
     t8 = 0,  t9 = 0, t10 = 0, t11 = 0, t12 = 0, t13 = 0, t14 = 0, t15 = 0,
    t16 = 0, t17 = 0, t18 = 0, t19 = 0, t20 = 0, t21 = 0, t22 = 0, t23 = 0,
    t24 = 0, t25 = 0, t26 = 0, t27 = 0, t28 = 0, t29 = 0, t30 = 0,
    b0 = b[0],
    b1 = b[1],
    b2 = b[2],
    b3 = b[3],
    b4 = b[4],
    b5 = b[5],
    b6 = b[6],
    b7 = b[7],
    b8 = b[8],
    b9 = b[9],
    b10 = b[10],
    b11 = b[11],
    b12 = b[12],
    b13 = b[13],
    b14 = b[14],
    b15 = b[15];

  v = a[0];
  t0 += v * b0;
  t1 += v * b1;
  t2 += v * b2;
  t3 += v * b3;
  t4 += v * b4;
  t5 += v * b5;
  t6 += v * b6;
  t7 += v * b7;
  t8 += v * b8;
  t9 += v * b9;
  t10 += v * b10;
  t11 += v * b11;
  t12 += v * b12;
  t13 += v * b13;
  t14 += v * b14;
  t15 += v * b15;
  v = a[1];
  t1 += v * b0;
  t2 += v * b1;
  t3 += v * b2;
  t4 += v * b3;
  t5 += v * b4;
  t6 += v * b5;
  t7 += v * b6;
  t8 += v * b7;
  t9 += v * b8;
  t10 += v * b9;
  t11 += v * b10;
  t12 += v * b11;
  t13 += v * b12;
  t14 += v * b13;
  t15 += v * b14;
  t16 += v * b15;
  v = a[2];
  t2 += v * b0;
  t3 += v * b1;
  t4 += v * b2;
  t5 += v * b3;
  t6 += v * b4;
  t7 += v * b5;
  t8 += v * b6;
  t9 += v * b7;
  t10 += v * b8;
  t11 += v * b9;
  t12 += v * b10;
  t13 += v * b11;
  t14 += v * b12;
  t15 += v * b13;
  t16 += v * b14;
  t17 += v * b15;
  v = a[3];
  t3 += v * b0;
  t4 += v * b1;
  t5 += v * b2;
  t6 += v * b3;
  t7 += v * b4;
  t8 += v * b5;
  t9 += v * b6;
  t10 += v * b7;
  t11 += v * b8;
  t12 += v * b9;
  t13 += v * b10;
  t14 += v * b11;
  t15 += v * b12;
  t16 += v * b13;
  t17 += v * b14;
  t18 += v * b15;
  v = a[4];
  t4 += v * b0;
  t5 += v * b1;
  t6 += v * b2;
  t7 += v * b3;
  t8 += v * b4;
  t9 += v * b5;
  t10 += v * b6;
  t11 += v * b7;
  t12 += v * b8;
  t13 += v * b9;
  t14 += v * b10;
  t15 += v * b11;
  t16 += v * b12;
  t17 += v * b13;
  t18 += v * b14;
  t19 += v * b15;
  v = a[5];
  t5 += v * b0;
  t6 += v * b1;
  t7 += v * b2;
  t8 += v * b3;
  t9 += v * b4;
  t10 += v * b5;
  t11 += v * b6;
  t12 += v * b7;
  t13 += v * b8;
  t14 += v * b9;
  t15 += v * b10;
  t16 += v * b11;
  t17 += v * b12;
  t18 += v * b13;
  t19 += v * b14;
  t20 += v * b15;
  v = a[6];
  t6 += v * b0;
  t7 += v * b1;
  t8 += v * b2;
  t9 += v * b3;
  t10 += v * b4;
  t11 += v * b5;
  t12 += v * b6;
  t13 += v * b7;
  t14 += v * b8;
  t15 += v * b9;
  t16 += v * b10;
  t17 += v * b11;
  t18 += v * b12;
  t19 += v * b13;
  t20 += v * b14;
  t21 += v * b15;
  v = a[7];
  t7 += v * b0;
  t8 += v * b1;
  t9 += v * b2;
  t10 += v * b3;
  t11 += v * b4;
  t12 += v * b5;
  t13 += v * b6;
  t14 += v * b7;
  t15 += v * b8;
  t16 += v * b9;
  t17 += v * b10;
  t18 += v * b11;
  t19 += v * b12;
  t20 += v * b13;
  t21 += v * b14;
  t22 += v * b15;
  v = a[8];
  t8 += v * b0;
  t9 += v * b1;
  t10 += v * b2;
  t11 += v * b3;
  t12 += v * b4;
  t13 += v * b5;
  t14 += v * b6;
  t15 += v * b7;
  t16 += v * b8;
  t17 += v * b9;
  t18 += v * b10;
  t19 += v * b11;
  t20 += v * b12;
  t21 += v * b13;
  t22 += v * b14;
  t23 += v * b15;
  v = a[9];
  t9 += v * b0;
  t10 += v * b1;
  t11 += v * b2;
  t12 += v * b3;
  t13 += v * b4;
  t14 += v * b5;
  t15 += v * b6;
  t16 += v * b7;
  t17 += v * b8;
  t18 += v * b9;
  t19 += v * b10;
  t20 += v * b11;
  t21 += v * b12;
  t22 += v * b13;
  t23 += v * b14;
  t24 += v * b15;
  v = a[10];
  t10 += v * b0;
  t11 += v * b1;
  t12 += v * b2;
  t13 += v * b3;
  t14 += v * b4;
  t15 += v * b5;
  t16 += v * b6;
  t17 += v * b7;
  t18 += v * b8;
  t19 += v * b9;
  t20 += v * b10;
  t21 += v * b11;
  t22 += v * b12;
  t23 += v * b13;
  t24 += v * b14;
  t25 += v * b15;
  v = a[11];
  t11 += v * b0;
  t12 += v * b1;
  t13 += v * b2;
  t14 += v * b3;
  t15 += v * b4;
  t16 += v * b5;
  t17 += v * b6;
  t18 += v * b7;
  t19 += v * b8;
  t20 += v * b9;
  t21 += v * b10;
  t22 += v * b11;
  t23 += v * b12;
  t24 += v * b13;
  t25 += v * b14;
  t26 += v * b15;
  v = a[12];
  t12 += v * b0;
  t13 += v * b1;
  t14 += v * b2;
  t15 += v * b3;
  t16 += v * b4;
  t17 += v * b5;
  t18 += v * b6;
  t19 += v * b7;
  t20 += v * b8;
  t21 += v * b9;
  t22 += v * b10;
  t23 += v * b11;
  t24 += v * b12;
  t25 += v * b13;
  t26 += v * b14;
  t27 += v * b15;
  v = a[13];
  t13 += v * b0;
  t14 += v * b1;
  t15 += v * b2;
  t16 += v * b3;
  t17 += v * b4;
  t18 += v * b5;
  t19 += v * b6;
  t20 += v * b7;
  t21 += v * b8;
  t22 += v * b9;
  t23 += v * b10;
  t24 += v * b11;
  t25 += v * b12;
  t26 += v * b13;
  t27 += v * b14;
  t28 += v * b15;
  v = a[14];
  t14 += v * b0;
  t15 += v * b1;
  t16 += v * b2;
  t17 += v * b3;
  t18 += v * b4;
  t19 += v * b5;
  t20 += v * b6;
  t21 += v * b7;
  t22 += v * b8;
  t23 += v * b9;
  t24 += v * b10;
  t25 += v * b11;
  t26 += v * b12;
  t27 += v * b13;
  t28 += v * b14;
  t29 += v * b15;
  v = a[15];
  t15 += v * b0;
  t16 += v * b1;
  t17 += v * b2;
  t18 += v * b3;
  t19 += v * b4;
  t20 += v * b5;
  t21 += v * b6;
  t22 += v * b7;
  t23 += v * b8;
  t24 += v * b9;
  t25 += v * b10;
  t26 += v * b11;
  t27 += v * b12;
  t28 += v * b13;
  t29 += v * b14;
  t30 += v * b15;

  t0  += 38 * t16;
  t1  += 38 * t17;
  t2  += 38 * t18;
  t3  += 38 * t19;
  t4  += 38 * t20;
  t5  += 38 * t21;
  t6  += 38 * t22;
  t7  += 38 * t23;
  t8  += 38 * t24;
  t9  += 38 * t25;
  t10 += 38 * t26;
  t11 += 38 * t27;
  t12 += 38 * t28;
  t13 += 38 * t29;
  t14 += 38 * t30;
  // t15 left as is

  // first car
  c = 1;
  v =  t0 + c + 65535; c = Math.floor(v / 65536);  t0 = v - c * 65536;
  v =  t1 + c + 65535; c = Math.floor(v / 65536);  t1 = v - c * 65536;
  v =  t2 + c + 65535; c = Math.floor(v / 65536);  t2 = v - c * 65536;
  v =  t3 + c + 65535; c = Math.floor(v / 65536);  t3 = v - c * 65536;
  v =  t4 + c + 65535; c = Math.floor(v / 65536);  t4 = v - c * 65536;
  v =  t5 + c + 65535; c = Math.floor(v / 65536);  t5 = v - c * 65536;
  v =  t6 + c + 65535; c = Math.floor(v / 65536);  t6 = v - c * 65536;
  v =  t7 + c + 65535; c = Math.floor(v / 65536);  t7 = v - c * 65536;
  v =  t8 + c + 65535; c = Math.floor(v / 65536);  t8 = v - c * 65536;
  v =  t9 + c + 65535; c = Math.floor(v / 65536);  t9 = v - c * 65536;
  v = t10 + c + 65535; c = Math.floor(v / 65536); t10 = v - c * 65536;
  v = t11 + c + 65535; c = Math.floor(v / 65536); t11 = v - c * 65536;
  v = t12 + c + 65535; c = Math.floor(v / 65536); t12 = v - c * 65536;
  v = t13 + c + 65535; c = Math.floor(v / 65536); t13 = v - c * 65536;
  v = t14 + c + 65535; c = Math.floor(v / 65536); t14 = v - c * 65536;
  v = t15 + c + 65535; c = Math.floor(v / 65536); t15 = v - c * 65536;
  t0 += c-1 + 37 * (c-1);

  // second car
  c = 1;
  v =  t0 + c + 65535; c = Math.floor(v / 65536);  t0 = v - c * 65536;
  v =  t1 + c + 65535; c = Math.floor(v / 65536);  t1 = v - c * 65536;
  v =  t2 + c + 65535; c = Math.floor(v / 65536);  t2 = v - c * 65536;
  v =  t3 + c + 65535; c = Math.floor(v / 65536);  t3 = v - c * 65536;
  v =  t4 + c + 65535; c = Math.floor(v / 65536);  t4 = v - c * 65536;
  v =  t5 + c + 65535; c = Math.floor(v / 65536);  t5 = v - c * 65536;
  v =  t6 + c + 65535; c = Math.floor(v / 65536);  t6 = v - c * 65536;
  v =  t7 + c + 65535; c = Math.floor(v / 65536);  t7 = v - c * 65536;
  v =  t8 + c + 65535; c = Math.floor(v / 65536);  t8 = v - c * 65536;
  v =  t9 + c + 65535; c = Math.floor(v / 65536);  t9 = v - c * 65536;
  v = t10 + c + 65535; c = Math.floor(v / 65536); t10 = v - c * 65536;
  v = t11 + c + 65535; c = Math.floor(v / 65536); t11 = v - c * 65536;
  v = t12 + c + 65535; c = Math.floor(v / 65536); t12 = v - c * 65536;
  v = t13 + c + 65535; c = Math.floor(v / 65536); t13 = v - c * 65536;
  v = t14 + c + 65535; c = Math.floor(v / 65536); t14 = v - c * 65536;
  v = t15 + c + 65535; c = Math.floor(v / 65536); t15 = v - c * 65536;
  t0 += c-1 + 37 * (c-1);

  o[ 0] = t0;
  o[ 1] = t1;
  o[ 2] = t2;
  o[ 3] = t3;
  o[ 4] = t4;
  o[ 5] = t5;
  o[ 6] = t6;
  o[ 7] = t7;
  o[ 8] = t8;
  o[ 9] = t9;
  o[10] = t10;
  o[11] = t11;
  o[12] = t12;
  o[13] = t13;
  o[14] = t14;
  o[15] = t15;
}

function S(o, a) {
  M(o, a, a);
}

function inv25519(o, i) {
  var c = gf();
  var a;
  for (a = 0; a < 16; a++) c[a] = i[a];
  for (a = 253; a >= 0; a--) {
    S(c, c);
    if(a !== 2 && a !== 4) M(c, c, i);
  }
  for (a = 0; a < 16; a++) o[a] = c[a];
}

function pow2523(o, i) {
  var c = gf();
  var a;
  for (a = 0; a < 16; a++) c[a] = i[a];
  for (a = 250; a >= 0; a--) {
      S(c, c);
      if(a !== 1) M(c, c, i);
  }
  for (a = 0; a < 16; a++) o[a] = c[a];
}

function crypto_scalarmult(q, n, p) {
  check(q, crypto_scalarmult_BYTES)
  check(n, crypto_scalarmult_SCALARBYTES)
  check(p, crypto_scalarmult_BYTES)
  var z = new Uint8Array(32);
  var x = new Float64Array(80), r, i;
  var a = gf(), b = gf(), c = gf(),
      d = gf(), e = gf(), f = gf();
  for (i = 0; i < 31; i++) z[i] = n[i];
  z[31]=(n[31]&127)|64;
  z[0]&=248;
  unpack25519(x,p);
  for (i = 0; i < 16; i++) {
    b[i]=x[i];
    d[i]=a[i]=c[i]=0;
  }
  a[0]=d[0]=1;
  for (i=254; i>=0; --i) {
    r=(z[i>>>3]>>>(i&7))&1;
    sel25519(a,b,r);
    sel25519(c,d,r);
    A(e,a,c);
    Z(a,a,c);
    A(c,b,d);
    Z(b,b,d);
    S(d,e);
    S(f,a);
    M(a,c,a);
    M(c,b,e);
    A(e,a,c);
    Z(a,a,c);
    S(b,a);
    Z(c,d,f);
    M(a,c,_121665);
    A(a,a,d);
    M(c,c,a);
    M(a,d,f);
    M(d,b,x);
    S(b,e);
    sel25519(a,b,r);
    sel25519(c,d,r);
  }
  for (i = 0; i < 16; i++) {
    x[i+16]=a[i];
    x[i+32]=c[i];
    x[i+48]=b[i];
    x[i+64]=d[i];
  }
  var x32 = x.subarray(32);
  var x16 = x.subarray(16);
  inv25519(x32,x32);
  M(x16,x16,x32);
  pack25519(q,x16);
  return 0;
}

function crypto_scalarmult_base(q, n) {
  return crypto_scalarmult(q, n, _9);
}

var K = [
  0x428a2f98, 0xd728ae22, 0x71374491, 0x23ef65cd,
  0xb5c0fbcf, 0xec4d3b2f, 0xe9b5dba5, 0x8189dbbc,
  0x3956c25b, 0xf348b538, 0x59f111f1, 0xb605d019,
  0x923f82a4, 0xaf194f9b, 0xab1c5ed5, 0xda6d8118,
  0xd807aa98, 0xa3030242, 0x12835b01, 0x45706fbe,
  0x243185be, 0x4ee4b28c, 0x550c7dc3, 0xd5ffb4e2,
  0x72be5d74, 0xf27b896f, 0x80deb1fe, 0x3b1696b1,
  0x9bdc06a7, 0x25c71235, 0xc19bf174, 0xcf692694,
  0xe49b69c1, 0x9ef14ad2, 0xefbe4786, 0x384f25e3,
  0x0fc19dc6, 0x8b8cd5b5, 0x240ca1cc, 0x77ac9c65,
  0x2de92c6f, 0x592b0275, 0x4a7484aa, 0x6ea6e483,
  0x5cb0a9dc, 0xbd41fbd4, 0x76f988da, 0x831153b5,
  0x983e5152, 0xee66dfab, 0xa831c66d, 0x2db43210,
  0xb00327c8, 0x98fb213f, 0xbf597fc7, 0xbeef0ee4,
  0xc6e00bf3, 0x3da88fc2, 0xd5a79147, 0x930aa725,
  0x06ca6351, 0xe003826f, 0x14292967, 0x0a0e6e70,
  0x27b70a85, 0x46d22ffc, 0x2e1b2138, 0x5c26c926,
  0x4d2c6dfc, 0x5ac42aed, 0x53380d13, 0x9d95b3df,
  0x650a7354, 0x8baf63de, 0x766a0abb, 0x3c77b2a8,
  0x81c2c92e, 0x47edaee6, 0x92722c85, 0x1482353b,
  0xa2bfe8a1, 0x4cf10364, 0xa81a664b, 0xbc423001,
  0xc24b8b70, 0xd0f89791, 0xc76c51a3, 0x0654be30,
  0xd192e819, 0xd6ef5218, 0xd6990624, 0x5565a910,
  0xf40e3585, 0x5771202a, 0x106aa070, 0x32bbd1b8,
  0x19a4c116, 0xb8d2d0c8, 0x1e376c08, 0x5141ab53,
  0x2748774c, 0xdf8eeb99, 0x34b0bcb5, 0xe19b48a8,
  0x391c0cb3, 0xc5c95a63, 0x4ed8aa4a, 0xe3418acb,
  0x5b9cca4f, 0x7763e373, 0x682e6ff3, 0xd6b2b8a3,
  0x748f82ee, 0x5defb2fc, 0x78a5636f, 0x43172f60,
  0x84c87814, 0xa1f0ab72, 0x8cc70208, 0x1a6439ec,
  0x90befffa, 0x23631e28, 0xa4506ceb, 0xde82bde9,
  0xbef9a3f7, 0xb2c67915, 0xc67178f2, 0xe372532b,
  0xca273ece, 0xea26619c, 0xd186b8c7, 0x21c0c207,
  0xeada7dd6, 0xcde0eb1e, 0xf57d4f7f, 0xee6ed178,
  0x06f067aa, 0x72176fba, 0x0a637dc5, 0xa2c898a6,
  0x113f9804, 0xbef90dae, 0x1b710b35, 0x131c471b,
  0x28db77f5, 0x23047d84, 0x32caab7b, 0x40c72493,
  0x3c9ebe0a, 0x15c9bebc, 0x431d67c4, 0x9c100d4c,
  0x4cc5d4be, 0xcb3e42b6, 0x597f299c, 0xfc657e2a,
  0x5fcb6fab, 0x3ad6faec, 0x6c44198c, 0x4a475817
];

function crypto_hashblocks_hl(hh, hl, m, n) {
  var wh = new Int32Array(16), wl = new Int32Array(16),
      bh0, bh1, bh2, bh3, bh4, bh5, bh6, bh7,
      bl0, bl1, bl2, bl3, bl4, bl5, bl6, bl7,
      th, tl, i, j, h, l, a, b, c, d;

  var ah0 = hh[0],
      ah1 = hh[1],
      ah2 = hh[2],
      ah3 = hh[3],
      ah4 = hh[4],
      ah5 = hh[5],
      ah6 = hh[6],
      ah7 = hh[7],

      al0 = hl[0],
      al1 = hl[1],
      al2 = hl[2],
      al3 = hl[3],
      al4 = hl[4],
      al5 = hl[5],
      al6 = hl[6],
      al7 = hl[7];

  var pos = 0;
  while (n >= 128) {
    for (i = 0; i < 16; i++) {
      j = 8 * i + pos;
      wh[i] = (m[j+0] << 24) | (m[j+1] << 16) | (m[j+2] << 8) | m[j+3];
      wl[i] = (m[j+4] << 24) | (m[j+5] << 16) | (m[j+6] << 8) | m[j+7];
    }
    for (i = 0; i < 80; i++) {
      bh0 = ah0;
      bh1 = ah1;
      bh2 = ah2;
      bh3 = ah3;
      bh4 = ah4;
      bh5 = ah5;
      bh6 = ah6;
      bh7 = ah7;

      bl0 = al0;
      bl1 = al1;
      bl2 = al2;
      bl3 = al3;
      bl4 = al4;
      bl5 = al5;
      bl6 = al6;
      bl7 = al7;

      // add
      h = ah7;
      l = al7;

      a = l & 0xffff; b = l >>> 16;
      c = h & 0xffff; d = h >>> 16;

      // Sigma1
      h = ((ah4 >>> 14) | (al4 << (32-14))) ^ ((ah4 >>> 18) | (al4 << (32-18))) ^ ((al4 >>> (41-32)) | (ah4 << (32-(41-32))));
      l = ((al4 >>> 14) | (ah4 << (32-14))) ^ ((al4 >>> 18) | (ah4 << (32-18))) ^ ((ah4 >>> (41-32)) | (al4 << (32-(41-32))));

      a += l & 0xffff; b += l >>> 16;
      c += h & 0xffff; d += h >>> 16;

      // Ch
      h = (ah4 & ah5) ^ (~ah4 & ah6);
      l = (al4 & al5) ^ (~al4 & al6);

      a += l & 0xffff; b += l >>> 16;
      c += h & 0xffff; d += h >>> 16;

      // K
      h = K[i*2];
      l = K[i*2+1];

      a += l & 0xffff; b += l >>> 16;
      c += h & 0xffff; d += h >>> 16;

      // w
      h = wh[i%16];
      l = wl[i%16];

      a += l & 0xffff; b += l >>> 16;
      c += h & 0xffff; d += h >>> 16;

      b += a >>> 16;
      c += b >>> 16;
      d += c >>> 16;

      th = c & 0xffff | d << 16;
      tl = a & 0xffff | b << 16;

      // add
      h = th;
      l = tl;

      a = l & 0xffff; b = l >>> 16;
      c = h & 0xffff; d = h >>> 16;

      // Sigma0
      h = ((ah0 >>> 28) | (al0 << (32-28))) ^ ((al0 >>> (34-32)) | (ah0 << (32-(34-32)))) ^ ((al0 >>> (39-32)) | (ah0 << (32-(39-32))));
      l = ((al0 >>> 28) | (ah0 << (32-28))) ^ ((ah0 >>> (34-32)) | (al0 << (32-(34-32)))) ^ ((ah0 >>> (39-32)) | (al0 << (32-(39-32))));

      a += l & 0xffff; b += l >>> 16;
      c += h & 0xffff; d += h >>> 16;

      // Maj
      h = (ah0 & ah1) ^ (ah0 & ah2) ^ (ah1 & ah2);
      l = (al0 & al1) ^ (al0 & al2) ^ (al1 & al2);

      a += l & 0xffff; b += l >>> 16;
      c += h & 0xffff; d += h >>> 16;

      b += a >>> 16;
      c += b >>> 16;
      d += c >>> 16;

      bh7 = (c & 0xffff) | (d << 16);
      bl7 = (a & 0xffff) | (b << 16);

      // add
      h = bh3;
      l = bl3;

      a = l & 0xffff; b = l >>> 16;
      c = h & 0xffff; d = h >>> 16;

      h = th;
      l = tl;

      a += l & 0xffff; b += l >>> 16;
      c += h & 0xffff; d += h >>> 16;

      b += a >>> 16;
      c += b >>> 16;
      d += c >>> 16;

      bh3 = (c & 0xffff) | (d << 16);
      bl3 = (a & 0xffff) | (b << 16);

      ah1 = bh0;
      ah2 = bh1;
      ah3 = bh2;
      ah4 = bh3;
      ah5 = bh4;
      ah6 = bh5;
      ah7 = bh6;
      ah0 = bh7;

      al1 = bl0;
      al2 = bl1;
      al3 = bl2;
      al4 = bl3;
      al5 = bl4;
      al6 = bl5;
      al7 = bl6;
      al0 = bl7;

      if (i%16 === 15) {
        for (j = 0; j < 16; j++) {
          // add
          h = wh[j];
          l = wl[j];

          a = l & 0xffff; b = l >>> 16;
          c = h & 0xffff; d = h >>> 16;

          h = wh[(j+9)%16];
          l = wl[(j+9)%16];

          a += l & 0xffff; b += l >>> 16;
          c += h & 0xffff; d += h >>> 16;

          // sigma0
          th = wh[(j+1)%16];
          tl = wl[(j+1)%16];
          h = ((th >>> 1) | (tl << (32-1))) ^ ((th >>> 8) | (tl << (32-8))) ^ (th >>> 7);
          l = ((tl >>> 1) | (th << (32-1))) ^ ((tl >>> 8) | (th << (32-8))) ^ ((tl >>> 7) | (th << (32-7)));

          a += l & 0xffff; b += l >>> 16;
          c += h & 0xffff; d += h >>> 16;

          // sigma1
          th = wh[(j+14)%16];
          tl = wl[(j+14)%16];
          h = ((th >>> 19) | (tl << (32-19))) ^ ((tl >>> (61-32)) | (th << (32-(61-32)))) ^ (th >>> 6);
          l = ((tl >>> 19) | (th << (32-19))) ^ ((th >>> (61-32)) | (tl << (32-(61-32)))) ^ ((tl >>> 6) | (th << (32-6)));

          a += l & 0xffff; b += l >>> 16;
          c += h & 0xffff; d += h >>> 16;

          b += a >>> 16;
          c += b >>> 16;
          d += c >>> 16;

          wh[j] = (c & 0xffff) | (d << 16);
          wl[j] = (a & 0xffff) | (b << 16);
        }
      }
    }

    // add
    h = ah0;
    l = al0;

    a = l & 0xffff; b = l >>> 16;
    c = h & 0xffff; d = h >>> 16;

    h = hh[0];
    l = hl[0];

    a += l & 0xffff; b += l >>> 16;
    c += h & 0xffff; d += h >>> 16;

    b += a >>> 16;
    c += b >>> 16;
    d += c >>> 16;

    hh[0] = ah0 = (c & 0xffff) | (d << 16);
    hl[0] = al0 = (a & 0xffff) | (b << 16);

    h = ah1;
    l = al1;

    a = l & 0xffff; b = l >>> 16;
    c = h & 0xffff; d = h >>> 16;

    h = hh[1];
    l = hl[1];

    a += l & 0xffff; b += l >>> 16;
    c += h & 0xffff; d += h >>> 16;

    b += a >>> 16;
    c += b >>> 16;
    d += c >>> 16;

    hh[1] = ah1 = (c & 0xffff) | (d << 16);
    hl[1] = al1 = (a & 0xffff) | (b << 16);

    h = ah2;
    l = al2;

    a = l & 0xffff; b = l >>> 16;
    c = h & 0xffff; d = h >>> 16;

    h = hh[2];
    l = hl[2];

    a += l & 0xffff; b += l >>> 16;
    c += h & 0xffff; d += h >>> 16;

    b += a >>> 16;
    c += b >>> 16;
    d += c >>> 16;

    hh[2] = ah2 = (c & 0xffff) | (d << 16);
    hl[2] = al2 = (a & 0xffff) | (b << 16);

    h = ah3;
    l = al3;

    a = l & 0xffff; b = l >>> 16;
    c = h & 0xffff; d = h >>> 16;

    h = hh[3];
    l = hl[3];

    a += l & 0xffff; b += l >>> 16;
    c += h & 0xffff; d += h >>> 16;

    b += a >>> 16;
    c += b >>> 16;
    d += c >>> 16;

    hh[3] = ah3 = (c & 0xffff) | (d << 16);
    hl[3] = al3 = (a & 0xffff) | (b << 16);

    h = ah4;
    l = al4;

    a = l & 0xffff; b = l >>> 16;
    c = h & 0xffff; d = h >>> 16;

    h = hh[4];
    l = hl[4];

    a += l & 0xffff; b += l >>> 16;
    c += h & 0xffff; d += h >>> 16;

    b += a >>> 16;
    c += b >>> 16;
    d += c >>> 16;

    hh[4] = ah4 = (c & 0xffff) | (d << 16);
    hl[4] = al4 = (a & 0xffff) | (b << 16);

    h = ah5;
    l = al5;

    a = l & 0xffff; b = l >>> 16;
    c = h & 0xffff; d = h >>> 16;

    h = hh[5];
    l = hl[5];

    a += l & 0xffff; b += l >>> 16;
    c += h & 0xffff; d += h >>> 16;

    b += a >>> 16;
    c += b >>> 16;
    d += c >>> 16;

    hh[5] = ah5 = (c & 0xffff) | (d << 16);
    hl[5] = al5 = (a & 0xffff) | (b << 16);

    h = ah6;
    l = al6;

    a = l & 0xffff; b = l >>> 16;
    c = h & 0xffff; d = h >>> 16;

    h = hh[6];
    l = hl[6];

    a += l & 0xffff; b += l >>> 16;
    c += h & 0xffff; d += h >>> 16;

    b += a >>> 16;
    c += b >>> 16;
    d += c >>> 16;

    hh[6] = ah6 = (c & 0xffff) | (d << 16);
    hl[6] = al6 = (a & 0xffff) | (b << 16);

    h = ah7;
    l = al7;

    a = l & 0xffff; b = l >>> 16;
    c = h & 0xffff; d = h >>> 16;

    h = hh[7];
    l = hl[7];

    a += l & 0xffff; b += l >>> 16;
    c += h & 0xffff; d += h >>> 16;

    b += a >>> 16;
    c += b >>> 16;
    d += c >>> 16;

    hh[7] = ah7 = (c & 0xffff) | (d << 16);
    hl[7] = al7 = (a & 0xffff) | (b << 16);

    pos += 128;
    n -= 128;
  }

  return n;
}

function crypto_hash(out, m, n) {
  var hh = new Int32Array(8),
      hl = new Int32Array(8),
      x = new Uint8Array(256),
      i, b = n;

  hh[0] = 0x6a09e667;
  hh[1] = 0xbb67ae85;
  hh[2] = 0x3c6ef372;
  hh[3] = 0xa54ff53a;
  hh[4] = 0x510e527f;
  hh[5] = 0x9b05688c;
  hh[6] = 0x1f83d9ab;
  hh[7] = 0x5be0cd19;

  hl[0] = 0xf3bcc908;
  hl[1] = 0x84caa73b;
  hl[2] = 0xfe94f82b;
  hl[3] = 0x5f1d36f1;
  hl[4] = 0xade682d1;
  hl[5] = 0x2b3e6c1f;
  hl[6] = 0xfb41bd6b;
  hl[7] = 0x137e2179;

  crypto_hashblocks_hl(hh, hl, m, n);
  n %= 128;

  for (i = 0; i < n; i++) x[i] = m[b-n+i];
  x[n] = 128;

  n = 256-128*(n<112?1:0);
  x[n-9] = 0;
  ts64(x, n-8,  (b / 0x20000000) | 0, b << 3);
  crypto_hashblocks_hl(hh, hl, x, n);

  for (i = 0; i < 8; i++) ts64(out, 8*i, hh[i], hl[i]);

  return 0;
}

function add(p, q) {
  var a = gf(), b = gf(), c = gf(),
      d = gf(), e = gf(), f = gf(),
      g = gf(), h = gf(), t = gf();

  Z(a, p[1], p[0]);
  Z(t, q[1], q[0]);
  M(a, a, t);
  A(b, p[0], p[1]);
  A(t, q[0], q[1]);
  M(b, b, t);
  M(c, p[3], q[3]);
  M(c, c, D2);
  M(d, p[2], q[2]);
  A(d, d, d);
  Z(e, b, a);
  Z(f, d, c);
  A(g, d, c);
  A(h, b, a);

  M(p[0], e, f);
  M(p[1], h, g);
  M(p[2], g, f);
  M(p[3], e, h);
}

function cswap(p, q, b) {
  var i;
  for (i = 0; i < 4; i++) {
    sel25519(p[i], q[i], b);
  }
}

function pack(r, p) {
  var tx = gf(), ty = gf(), zi = gf();
  inv25519(zi, p[2]);
  M(tx, p[0], zi);
  M(ty, p[1], zi);
  pack25519(r, ty);
  r[31] ^= par25519(tx) << 7;
}

function scalarmult(p, q, s) {
  var b, i;
  set25519(p[0], gf0);
  set25519(p[1], gf1);
  set25519(p[2], gf1);
  set25519(p[3], gf0);
  for (i = 255; i >= 0; --i) {
    b = (s[(i/8)|0] >> (i&7)) & 1;
    cswap(p, q, b);
    add(q, p);
    add(p, p);
    cswap(p, q, b);
  }
}

function scalarbase(p, s) {
  var q = [gf(), gf(), gf(), gf()];
  set25519(q[0], X);
  set25519(q[1], Y);
  set25519(q[2], gf1);
  M(q[3], X, Y);
  scalarmult(p, q, s);
}

function crypto_sign_keypair(pk, sk, seeded) {
  check(pk, sodium.crypto_sign_PUBLICKEYBYTES)
  check(sk, sodium.crypto_sign_SECRETKEYBYTES)

  var d = new Uint8Array(64);
  var p = [gf(), gf(), gf(), gf()];
  var i;

  if (!seeded) randombytes(sk, 32);
  crypto_hash(d, sk, 32);
  d[0] &= 248;
  d[31] &= 127;
  d[31] |= 64;

  scalarbase(p, d);
  pack(pk, p);

  for (i = 0; i < 32; i++) sk[i+32] = pk[i];
  return 0;
}

function crypto_sign_seed_keypair (pk, sk, seed) {
  check(seed, sodium.crypto_sign_SEEDBYTES)
  seed.copy(sk)
  crypto_sign_keypair(pk, sk, true)
}

var L = new Float64Array([0xed, 0xd3, 0xf5, 0x5c, 0x1a, 0x63, 0x12, 0x58, 0xd6, 0x9c, 0xf7, 0xa2, 0xde, 0xf9, 0xde, 0x14, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x10]);

function modL(r, x) {
  var carry, i, j, k;
  for (i = 63; i >= 32; --i) {
    carry = 0;
    for (j = i - 32, k = i - 12; j < k; ++j) {
      x[j] += carry - 16 * x[i] * L[j - (i - 32)];
      carry = (x[j] + 128) >> 8;
      x[j] -= carry * 256;
    }
    x[j] += carry;
    x[i] = 0;
  }
  carry = 0;
  for (j = 0; j < 32; j++) {
    x[j] += carry - (x[31] >> 4) * L[j];
    carry = x[j] >> 8;
    x[j] &= 255;
  }
  for (j = 0; j < 32; j++) x[j] -= carry * L[j];
  for (i = 0; i < 32; i++) {
    x[i+1] += x[i] >> 8;
    r[i] = x[i] & 255;
  }
}

function reduce(r) {
  var x = new Float64Array(64), i;
  for (i = 0; i < 64; i++) x[i] = r[i];
  for (i = 0; i < 64; i++) r[i] = 0;
  modL(r, x);
}

// Note: difference from C - smlen returned, not passed as argument.
function crypto_sign(sm, m, sk) {
  check(sm, crypto_sign_BYTES + m.length)
  check(m, 0)
  check(sk, crypto_sign_SECRETKEYBYTES)
  var n = m.length

  var d = new Uint8Array(64), h = new Uint8Array(64), r = new Uint8Array(64);
  var i, j, x = new Float64Array(64);
  var p = [gf(), gf(), gf(), gf()];

  crypto_hash(d, sk, 32);
  d[0] &= 248;
  d[31] &= 127;
  d[31] |= 64;

  var smlen = n + 64;
  for (i = 0; i < n; i++) sm[64 + i] = m[i];
  for (i = 0; i < 32; i++) sm[32 + i] = d[32 + i];

  crypto_hash(r, sm.subarray(32), n+32);
  reduce(r);
  scalarbase(p, r);
  pack(sm, p);

  for (i = 32; i < 64; i++) sm[i] = sk[i];
  crypto_hash(h, sm, n + 64);
  reduce(h);

  for (i = 0; i < 64; i++) x[i] = 0;
  for (i = 0; i < 32; i++) x[i] = r[i];
  for (i = 0; i < 32; i++) {
    for (j = 0; j < 32; j++) {
      x[i+j] += h[i] * d[j];
    }
  }

  modL(sm.subarray(32), x);
}

function crypto_sign_detached(sig, m, sk) {
  var sm = new Uint8Array(m.length + crypto_sign_BYTES)
  crypto_sign(sm, m, sk)
  for (var i = 0; i < crypto_sign_BYTES; i++) sig[i] = sm[i]
}

function unpackneg(r, p) {
  var t = gf(), chk = gf(), num = gf(),
      den = gf(), den2 = gf(), den4 = gf(),
      den6 = gf();

  set25519(r[2], gf1);
  unpack25519(r[1], p);
  S(num, r[1]);
  M(den, num, D);
  Z(num, num, r[2]);
  A(den, r[2], den);

  S(den2, den);
  S(den4, den2);
  M(den6, den4, den2);
  M(t, den6, num);
  M(t, t, den);

  pow2523(t, t);
  M(t, t, num);
  M(t, t, den);
  M(t, t, den);
  M(r[0], t, den);

  S(chk, r[0]);
  M(chk, chk, den);
  if (neq25519(chk, num)) M(r[0], r[0], I);

  S(chk, r[0]);
  M(chk, chk, den);
  if (neq25519(chk, num)) return -1;

  if (par25519(r[0]) === (p[31]>>7)) Z(r[0], gf0, r[0]);

  M(r[3], r[0], r[1]);
  return 0;
}

function crypto_sign_open(msg, sm, pk) {
  check(msg, sm.length - crypto_sign_BYTES)
  check(sm, crypto_sign_BYTES)
  check(pk, crypto_sign_PUBLICKEYBYTES)
  var n = sm.length
  var m = new Uint8Array(sm.length)

  var i, mlen;
  var t = new Uint8Array(32), h = new Uint8Array(64);
  var p = [gf(), gf(), gf(), gf()],
      q = [gf(), gf(), gf(), gf()];

  mlen = -1;
  if (n < 64) return false;

  if (unpackneg(q, pk)) return false;

  for (i = 0; i < n; i++) m[i] = sm[i];
  for (i = 0; i < 32; i++) m[i+32] = pk[i];
  crypto_hash(h, m, n);
  reduce(h);
  scalarmult(p, q, h);

  scalarbase(q, sm.subarray(32));
  add(p, q);
  pack(t, p);

  n -= 64;
  if (crypto_verify_32(sm, 0, t, 0)) {
    for (i = 0; i < n; i++) m[i] = 0;
    return false;
  }

  for (i = 0; i < n; i++) msg[i] = sm[i + 64];
  mlen = n;
  return true;
}

function crypto_sign_verify_detached (sig, m, pk) {
  check(sig, crypto_sign_BYTES)
  var sm = new Uint8Array(m.length + crypto_sign_BYTES)
  var i = 0
  for (i = 0; i < crypto_sign_BYTES; i++) sm[i] = sig[i]
  for (i = 0; i < m.length; i++) sm[i + crypto_sign_BYTES] = m[i]
  return crypto_sign_open(m, sm, pk)
}

function crypto_secretbox_detached (o, mac, msg, n, k) {
  check(mac, sodium.crypto_secretbox_MACBYTES)
  var tmp = new Uint8Array(msg.length + mac.length)
  crypto_secretbox_easy(tmp, msg, n, k)
  o.set(tmp.subarray(0, msg.length))
  mac.set(tmp.subarray(msg.length))
}

function crypto_secretbox_open_detached (msg, o, mac, n, k) {
  check(mac, sodium.crypto_secretbox_MACBYTES)
  var tmp = new Uint8Array(o.length + mac.length)
  tmp.set(o)
  tmp.set(mac, msg.length)
  return crypto_secretbox_open_easy(msg, tmp, n, k)
}

function crypto_secretbox_easy(o, msg, n, k) {
  check(msg, 0)
  check(o, msg.length + sodium.crypto_secretbox_MACBYTES)
  check(n, crypto_secretbox_NONCEBYTES)
  check(k, crypto_secretbox_KEYBYTES)

  var i
  var m = new Uint8Array(crypto_secretbox_ZEROBYTES + msg.length);
  var c = new Uint8Array(m.length);
  for (i = 0; i < msg.length; i++) m[i+crypto_secretbox_ZEROBYTES] = msg[i];
  crypto_secretbox(c, m, m.length, n, k);
  for (i = crypto_secretbox_BOXZEROBYTES; i < c.length; i++) o[i - crypto_secretbox_BOXZEROBYTES] = c[i]
}

function crypto_secretbox_open_easy(msg, box, n, k) {
  check(box, sodium.crypto_secretbox_MACBYTES)
  check(msg, box.length - sodium.crypto_secretbox_MACBYTES)
  check(n, crypto_secretbox_NONCEBYTES)
  check(k, crypto_secretbox_KEYBYTES)

  var i
  var c = new Uint8Array(crypto_secretbox_BOXZEROBYTES + box.length);
  var m = new Uint8Array(c.length);
  for (i = 0; i < box.length; i++) c[i+crypto_secretbox_BOXZEROBYTES] = box[i];
  if (c.length < 32) return false;
  if (crypto_secretbox_open(m, c, c.length, n, k) !== 0) return false;

  for (i = crypto_secretbox_ZEROBYTES; i < m.length; i++) msg[i - crypto_secretbox_ZEROBYTES] = m[i]
  return true
}

var crypto_secretbox_KEYBYTES = 32,
    crypto_secretbox_NONCEBYTES = 24,
    crypto_secretbox_ZEROBYTES = 32,
    crypto_secretbox_BOXZEROBYTES = 16,
    crypto_scalarmult_BYTES = 32,
    crypto_scalarmult_SCALARBYTES = 32,
    crypto_box_PUBLICKEYBYTES = 32,
    crypto_box_SECRETKEYBYTES = 32,
    crypto_box_BEFORENMBYTES = 32,
    crypto_box_NONCEBYTES = crypto_secretbox_NONCEBYTES,
    crypto_box_ZEROBYTES = crypto_secretbox_ZEROBYTES,
    crypto_box_BOXZEROBYTES = crypto_secretbox_BOXZEROBYTES,
    crypto_sign_BYTES = 64,
    crypto_sign_PUBLICKEYBYTES = 32,
    crypto_sign_SECRETKEYBYTES = 64,
    crypto_sign_SEEDBYTES = 32,
    crypto_hash_BYTES = 64;

sodium.memzero = function (len, offset) {
  for (var i = offset; i < len; i++) arr[i] = 0;
}

sodium.crypto_sign_BYTES = crypto_sign_BYTES
sodium.crypto_sign_PUBLICKEYBYTES = crypto_sign_PUBLICKEYBYTES
sodium.crypto_sign_SECRETKEYBYTES = crypto_sign_SECRETKEYBYTES
sodium.crypto_sign_SEEDBYTES = crypto_sign_SEEDBYTES
sodium.crypto_sign_keypair = crypto_sign_keypair
sodium.crypto_sign_seed_keypair = crypto_sign_seed_keypair
sodium.crypto_sign = crypto_sign
sodium.crypto_sign_open = crypto_sign_open
sodium.crypto_sign_detached = crypto_sign_detached
sodium.crypto_sign_verify_detached = crypto_sign_verify_detached

forward(require('./crypto_generichash'))
forward(require('./crypto_kdf'))
forward(require('./crypto_shorthash'))
forward(require('./randombytes'))
forward(require('./crypto_stream'))

sodium.crypto_scalarmult_BYTES = crypto_scalarmult_BYTES
sodium.crypto_scalarmult_SCALARBYTES = crypto_scalarmult_SCALARBYTES
sodium.crypto_scalarmult_base = crypto_scalarmult_base
sodium.crypto_scalarmult = crypto_scalarmult

sodium.crypto_secretbox_KEYBYTES = crypto_secretbox_KEYBYTES,
sodium.crypto_secretbox_NONCEBYTES = crypto_secretbox_NONCEBYTES,
sodium.crypto_secretbox_MACBYTES = 16
sodium.crypto_secretbox_easy = crypto_secretbox_easy
sodium.crypto_secretbox_open_easy = crypto_secretbox_open_easy
sodium.crypto_secretbox_detached = crypto_secretbox_detached
sodium.crypto_secretbox_open_detached = crypto_secretbox_open_detached

function cleanup(arr) {
  for (var i = 0; i < arr.length; i++) arr[i] = 0;
}

function check (buf, len) {
  if (!buf || (len && buf.length < len)) throw new Error('Argument must be a buffer' + (len ? ' of length ' + len : ''))
}

function forward (submodule) {
  Object.keys(submodule).forEach(function (prop) {
    module.exports[prop] = submodule[prop]
  })
}

},{"./crypto_generichash":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/sodium-javascript/crypto_generichash.js","./crypto_kdf":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/sodium-javascript/crypto_kdf.js","./crypto_shorthash":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/sodium-javascript/crypto_shorthash.js","./crypto_stream":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/sodium-javascript/crypto_stream.js","./randombytes":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/sodium-javascript/randombytes.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/sodium-javascript/randombytes.js":[function(require,module,exports){
(function (global){
var assert = require('nanoassert')
var randombytes = (function () {
  var QUOTA = 65536 // limit for QuotaExceededException
  var crypto = typeof global !== 'undefined' ? crypto = (global.crypto || global.msCrypto) : null

  function browserBytes (out, n) {
    for (var i = 0; i < n; i += QUOTA) {
      crypto.getRandomValues(out.subarray(i, i + Math.min(n - i, QUOTA)))
    }
  }

  function nodeBytes (out, n) {
    out.set(crypto.randomBytes(n))
  }

  function noImpl () {
    throw new Error('No secure random number generator available')
  }

  if (crypto && crypto.getRandomValues) {
    return browserBytes
  } else if (typeof require !== 'undefined') {
    // Node.js.
    crypto = require('crypto')
    if (crypto && crypto.randomBytes) {
      return nodeBytes
    }
  }

  return noImpl
})()

Object.defineProperty(module.exports, 'randombytes', {
  value: randombytes
})

module.exports.randombytes_buf = function (out) {
  assert(out, 'out must be given')
  randombytes(out, out.length)
}

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"crypto":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/browser-resolve/empty.js","nanoassert":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/nanoassert/index.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/sodium-universal/browser.js":[function(require,module,exports){
module.exports = require('sodium-javascript')

},{"sodium-javascript":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/sodium-javascript/index.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/sorted-indexof/index.js":[function(require,module,exports){
module.exports = indexOf

function indexOf (left, right) {
  var result = new Array(right.length)
  var i = 0
  var j = 0

  while (i < left.length && j < right.length) {
    var a = left[i]
    var b = right[j]

    if (a === b) {
      result[j++] = i
      continue
    }

    if (a < b) {
      i++
      continue
    }

    result[j++] = -1
    continue
  }

  for (; j < right.length; j++) result[j] = -1

  return result
}

},{}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/sparse-bitfield/index.js":[function(require,module,exports){
(function (Buffer){
var pager = require('memory-pager')

module.exports = Bitfield

function Bitfield (opts) {
  if (!(this instanceof Bitfield)) return new Bitfield(opts)
  if (!opts) opts = {}
  if (Buffer.isBuffer(opts)) opts = {buffer: opts}

  this.pageOffset = opts.pageOffset || 0
  this.pageSize = opts.pageSize || 1024
  this.pages = opts.pages || pager(this.pageSize)

  this.byteLength = this.pages.length * this.pageSize
  this.length = 8 * this.byteLength

  if (!powerOfTwo(this.pageSize)) throw new Error('The page size should be a power of two')

  this._trackUpdates = !!opts.trackUpdates
  this._pageMask = this.pageSize - 1

  if (opts.buffer) {
    for (var i = 0; i < opts.buffer.length; i += this.pageSize) {
      this.pages.set(i / this.pageSize, opts.buffer.slice(i, i + this.pageSize))
    }
    this.byteLength = opts.buffer.length
    this.length = 8 * this.byteLength
  }
}

Bitfield.prototype.get = function (i) {
  var o = i & 7
  var j = (i - o) / 8

  return !!(this.getByte(j) & (128 >> o))
}

Bitfield.prototype.getByte = function (i) {
  var o = i & this._pageMask
  var j = (i - o) / this.pageSize
  var page = this.pages.get(j, true)

  return page ? page.buffer[o + this.pageOffset] : 0
}

Bitfield.prototype.set = function (i, v) {
  var o = i & 7
  var j = (i - o) / 8
  var b = this.getByte(j)

  return this.setByte(j, v ? b | (128 >> o) : b & (255 ^ (128 >> o)))
}

Bitfield.prototype.toBuffer = function () {
  var all = alloc(this.pages.length * this.pageSize)

  for (var i = 0; i < this.pages.length; i++) {
    var next = this.pages.get(i, true)
    var allOffset = i * this.pageSize
    if (next) next.buffer.copy(all, allOffset, this.pageOffset, this.pageOffset + this.pageSize)
  }

  return all
}

Bitfield.prototype.setByte = function (i, b) {
  var o = i & this._pageMask
  var j = (i - o) / this.pageSize
  var page = this.pages.get(j, false)

  o += this.pageOffset

  if (page.buffer[o] === b) return false
  page.buffer[o] = b

  if (i >= this.byteLength) {
    this.byteLength = i + 1
    this.length = this.byteLength * 8
  }

  if (this._trackUpdates) this.pages.updated(page)

  return true
}

function alloc (n) {
  if (Buffer.alloc) return Buffer.alloc(n)
  var b = new Buffer(n)
  b.fill(0)
  return b
}

function powerOfTwo (x) {
  return !(x & (x - 1))
}

}).call(this,require("buffer").Buffer)
},{"buffer":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/buffer/index.js","memory-pager":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/memory-pager/index.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/stream-browserify/index.js":[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

module.exports = Stream;

var EE = require('events').EventEmitter;
var inherits = require('inherits');

inherits(Stream, EE);
Stream.Readable = require('readable-stream/readable.js');
Stream.Writable = require('readable-stream/writable.js');
Stream.Duplex = require('readable-stream/duplex.js');
Stream.Transform = require('readable-stream/transform.js');
Stream.PassThrough = require('readable-stream/passthrough.js');

// Backwards-compat with node 0.4.x
Stream.Stream = Stream;



// old-style streams.  Note that the pipe method (the only relevant
// part of this class) is overridden in the Readable class.

function Stream() {
  EE.call(this);
}

Stream.prototype.pipe = function(dest, options) {
  var source = this;

  function ondata(chunk) {
    if (dest.writable) {
      if (false === dest.write(chunk) && source.pause) {
        source.pause();
      }
    }
  }

  source.on('data', ondata);

  function ondrain() {
    if (source.readable && source.resume) {
      source.resume();
    }
  }

  dest.on('drain', ondrain);

  // If the 'end' option is not supplied, dest.end() will be called when
  // source gets the 'end' or 'close' events.  Only dest.end() once.
  if (!dest._isStdio && (!options || options.end !== false)) {
    source.on('end', onend);
    source.on('close', onclose);
  }

  var didOnEnd = false;
  function onend() {
    if (didOnEnd) return;
    didOnEnd = true;

    dest.end();
  }


  function onclose() {
    if (didOnEnd) return;
    didOnEnd = true;

    if (typeof dest.destroy === 'function') dest.destroy();
  }

  // don't leave dangling pipes when there are errors.
  function onerror(er) {
    cleanup();
    if (EE.listenerCount(this, 'error') === 0) {
      throw er; // Unhandled stream error in pipe.
    }
  }

  source.on('error', onerror);
  dest.on('error', onerror);

  // remove all the event listeners that were added.
  function cleanup() {
    source.removeListener('data', ondata);
    dest.removeListener('drain', ondrain);

    source.removeListener('end', onend);
    source.removeListener('close', onclose);

    source.removeListener('error', onerror);
    dest.removeListener('error', onerror);

    source.removeListener('end', cleanup);
    source.removeListener('close', cleanup);

    dest.removeListener('close', cleanup);
  }

  source.on('end', cleanup);
  source.on('close', cleanup);

  dest.on('close', cleanup);

  dest.emit('pipe', source);

  // Allow for unix-like usage: A.pipe(B).pipe(C)
  return dest;
};

},{"events":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/browserify/node_modules/events/events.js","inherits":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/inherits/inherits_browser.js","readable-stream/duplex.js":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/readable-stream/duplex-browser.js","readable-stream/passthrough.js":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/readable-stream/passthrough.js","readable-stream/readable.js":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/readable-stream/readable-browser.js","readable-stream/transform.js":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/readable-stream/transform.js","readable-stream/writable.js":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/readable-stream/writable-browser.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/stream-shift/index.js":[function(require,module,exports){
module.exports = shift

function shift (stream) {
  var rs = stream._readableState
  if (!rs) return null
  return rs.objectMode ? stream.read() : stream.read(getStateLength(rs))
}

function getStateLength (state) {
  if (state.buffer.length) {
    // Since node 6.3.0 state.buffer is a BufferList not an array
    if (state.buffer.head) {
      return state.buffer.head.data.length
    }

    return state.buffer[0].length
  }

  return state.length
}

},{}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/string_decoder/lib/string_decoder.js":[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

'use strict';

/*<replacement>*/

var Buffer = require('safe-buffer').Buffer;
/*</replacement>*/

var isEncoding = Buffer.isEncoding || function (encoding) {
  encoding = '' + encoding;
  switch (encoding && encoding.toLowerCase()) {
    case 'hex':case 'utf8':case 'utf-8':case 'ascii':case 'binary':case 'base64':case 'ucs2':case 'ucs-2':case 'utf16le':case 'utf-16le':case 'raw':
      return true;
    default:
      return false;
  }
};

function _normalizeEncoding(enc) {
  if (!enc) return 'utf8';
  var retried;
  while (true) {
    switch (enc) {
      case 'utf8':
      case 'utf-8':
        return 'utf8';
      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return 'utf16le';
      case 'latin1':
      case 'binary':
        return 'latin1';
      case 'base64':
      case 'ascii':
      case 'hex':
        return enc;
      default:
        if (retried) return; // undefined
        enc = ('' + enc).toLowerCase();
        retried = true;
    }
  }
};

// Do not cache `Buffer.isEncoding` when checking encoding names as some
// modules monkey-patch it to support additional encodings
function normalizeEncoding(enc) {
  var nenc = _normalizeEncoding(enc);
  if (typeof nenc !== 'string' && (Buffer.isEncoding === isEncoding || !isEncoding(enc))) throw new Error('Unknown encoding: ' + enc);
  return nenc || enc;
}

// StringDecoder provides an interface for efficiently splitting a series of
// buffers into a series of JS strings without breaking apart multi-byte
// characters.
exports.StringDecoder = StringDecoder;
function StringDecoder(encoding) {
  this.encoding = normalizeEncoding(encoding);
  var nb;
  switch (this.encoding) {
    case 'utf16le':
      this.text = utf16Text;
      this.end = utf16End;
      nb = 4;
      break;
    case 'utf8':
      this.fillLast = utf8FillLast;
      nb = 4;
      break;
    case 'base64':
      this.text = base64Text;
      this.end = base64End;
      nb = 3;
      break;
    default:
      this.write = simpleWrite;
      this.end = simpleEnd;
      return;
  }
  this.lastNeed = 0;
  this.lastTotal = 0;
  this.lastChar = Buffer.allocUnsafe(nb);
}

StringDecoder.prototype.write = function (buf) {
  if (buf.length === 0) return '';
  var r;
  var i;
  if (this.lastNeed) {
    r = this.fillLast(buf);
    if (r === undefined) return '';
    i = this.lastNeed;
    this.lastNeed = 0;
  } else {
    i = 0;
  }
  if (i < buf.length) return r ? r + this.text(buf, i) : this.text(buf, i);
  return r || '';
};

StringDecoder.prototype.end = utf8End;

// Returns only complete characters in a Buffer
StringDecoder.prototype.text = utf8Text;

// Attempts to complete a partial non-UTF-8 character using bytes from a Buffer
StringDecoder.prototype.fillLast = function (buf) {
  if (this.lastNeed <= buf.length) {
    buf.copy(this.lastChar, this.lastTotal - this.lastNeed, 0, this.lastNeed);
    return this.lastChar.toString(this.encoding, 0, this.lastTotal);
  }
  buf.copy(this.lastChar, this.lastTotal - this.lastNeed, 0, buf.length);
  this.lastNeed -= buf.length;
};

// Checks the type of a UTF-8 byte, whether it's ASCII, a leading byte, or a
// continuation byte. If an invalid byte is detected, -2 is returned.
function utf8CheckByte(byte) {
  if (byte <= 0x7F) return 0;else if (byte >> 5 === 0x06) return 2;else if (byte >> 4 === 0x0E) return 3;else if (byte >> 3 === 0x1E) return 4;
  return byte >> 6 === 0x02 ? -1 : -2;
}

// Checks at most 3 bytes at the end of a Buffer in order to detect an
// incomplete multi-byte UTF-8 character. The total number of bytes (2, 3, or 4)
// needed to complete the UTF-8 character (if applicable) are returned.
function utf8CheckIncomplete(self, buf, i) {
  var j = buf.length - 1;
  if (j < i) return 0;
  var nb = utf8CheckByte(buf[j]);
  if (nb >= 0) {
    if (nb > 0) self.lastNeed = nb - 1;
    return nb;
  }
  if (--j < i || nb === -2) return 0;
  nb = utf8CheckByte(buf[j]);
  if (nb >= 0) {
    if (nb > 0) self.lastNeed = nb - 2;
    return nb;
  }
  if (--j < i || nb === -2) return 0;
  nb = utf8CheckByte(buf[j]);
  if (nb >= 0) {
    if (nb > 0) {
      if (nb === 2) nb = 0;else self.lastNeed = nb - 3;
    }
    return nb;
  }
  return 0;
}

// Validates as many continuation bytes for a multi-byte UTF-8 character as
// needed or are available. If we see a non-continuation byte where we expect
// one, we "replace" the validated continuation bytes we've seen so far with
// a single UTF-8 replacement character ('\ufffd'), to match v8's UTF-8 decoding
// behavior. The continuation byte check is included three times in the case
// where all of the continuation bytes for a character exist in the same buffer.
// It is also done this way as a slight performance increase instead of using a
// loop.
function utf8CheckExtraBytes(self, buf, p) {
  if ((buf[0] & 0xC0) !== 0x80) {
    self.lastNeed = 0;
    return '\ufffd';
  }
  if (self.lastNeed > 1 && buf.length > 1) {
    if ((buf[1] & 0xC0) !== 0x80) {
      self.lastNeed = 1;
      return '\ufffd';
    }
    if (self.lastNeed > 2 && buf.length > 2) {
      if ((buf[2] & 0xC0) !== 0x80) {
        self.lastNeed = 2;
        return '\ufffd';
      }
    }
  }
}

// Attempts to complete a multi-byte UTF-8 character using bytes from a Buffer.
function utf8FillLast(buf) {
  var p = this.lastTotal - this.lastNeed;
  var r = utf8CheckExtraBytes(this, buf, p);
  if (r !== undefined) return r;
  if (this.lastNeed <= buf.length) {
    buf.copy(this.lastChar, p, 0, this.lastNeed);
    return this.lastChar.toString(this.encoding, 0, this.lastTotal);
  }
  buf.copy(this.lastChar, p, 0, buf.length);
  this.lastNeed -= buf.length;
}

// Returns all complete UTF-8 characters in a Buffer. If the Buffer ended on a
// partial character, the character's bytes are buffered until the required
// number of bytes are available.
function utf8Text(buf, i) {
  var total = utf8CheckIncomplete(this, buf, i);
  if (!this.lastNeed) return buf.toString('utf8', i);
  this.lastTotal = total;
  var end = buf.length - (total - this.lastNeed);
  buf.copy(this.lastChar, 0, end);
  return buf.toString('utf8', i, end);
}

// For UTF-8, a replacement character is added when ending on a partial
// character.
function utf8End(buf) {
  var r = buf && buf.length ? this.write(buf) : '';
  if (this.lastNeed) return r + '\ufffd';
  return r;
}

// UTF-16LE typically needs two bytes per character, but even if we have an even
// number of bytes available, we need to check if we end on a leading/high
// surrogate. In that case, we need to wait for the next two bytes in order to
// decode the last character properly.
function utf16Text(buf, i) {
  if ((buf.length - i) % 2 === 0) {
    var r = buf.toString('utf16le', i);
    if (r) {
      var c = r.charCodeAt(r.length - 1);
      if (c >= 0xD800 && c <= 0xDBFF) {
        this.lastNeed = 2;
        this.lastTotal = 4;
        this.lastChar[0] = buf[buf.length - 2];
        this.lastChar[1] = buf[buf.length - 1];
        return r.slice(0, -1);
      }
    }
    return r;
  }
  this.lastNeed = 1;
  this.lastTotal = 2;
  this.lastChar[0] = buf[buf.length - 1];
  return buf.toString('utf16le', i, buf.length - 1);
}

// For UTF-16LE we do not explicitly append special replacement characters if we
// end on a partial character, we simply let v8 handle that.
function utf16End(buf) {
  var r = buf && buf.length ? this.write(buf) : '';
  if (this.lastNeed) {
    var end = this.lastTotal - this.lastNeed;
    return r + this.lastChar.toString('utf16le', 0, end);
  }
  return r;
}

function base64Text(buf, i) {
  var n = (buf.length - i) % 3;
  if (n === 0) return buf.toString('base64', i);
  this.lastNeed = 3 - n;
  this.lastTotal = 3;
  if (n === 1) {
    this.lastChar[0] = buf[buf.length - 1];
  } else {
    this.lastChar[0] = buf[buf.length - 2];
    this.lastChar[1] = buf[buf.length - 1];
  }
  return buf.toString('base64', i, buf.length - n);
}

function base64End(buf) {
  var r = buf && buf.length ? this.write(buf) : '';
  if (this.lastNeed) return r + this.lastChar.toString('base64', 0, 3 - this.lastNeed);
  return r;
}

// Pass bytes on through for single-byte encodings (e.g. ascii, latin1, hex)
function simpleWrite(buf) {
  return buf.toString(this.encoding);
}

function simpleEnd(buf) {
  return buf && buf.length ? this.write(buf) : '';
}
},{"safe-buffer":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/safe-buffer/index.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/thunky/index.js":[function(require,module,exports){
(function (process){
'use strict'

var nextTick = nextTickArgs
process.nextTick(upgrade, 42) // pass 42 and see if upgrade is called with it

module.exports = thunky

function thunky (fn) {
  var state = run
  return thunk

  function thunk (callback) {
    state(callback || noop)
  }

  function run (callback) {
    var stack = [callback]
    state = wait
    fn(done)

    function wait (callback) {
      stack.push(callback)
    }

    function done (err) {
      var args = arguments
      state = isError(err) ? run : finished
      while (stack.length) finished(stack.shift())

      function finished (callback) {
        nextTick(apply, callback, args)
      }
    }
  }
}

function isError (err) { // inlined from util so this works in the browser
  return Object.prototype.toString.call(err) === '[object Error]'
}

function noop () {}

function apply (callback, args) {
  callback.apply(null, args)
}

function upgrade (val) {
  if (val === 42) nextTick = process.nextTick
}

function nextTickArgs (fn, a, b) {
  process.nextTick(function () {
    fn(a, b)
  })
}

}).call(this,require('_process'))
},{"_process":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/process/browser.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/timers-browserify/main.js":[function(require,module,exports){
(function (setImmediate,clearImmediate){
var nextTick = require('process/browser.js').nextTick;
var apply = Function.prototype.apply;
var slice = Array.prototype.slice;
var immediateIds = {};
var nextImmediateId = 0;

// DOM APIs, for completeness

exports.setTimeout = function() {
  return new Timeout(apply.call(setTimeout, window, arguments), clearTimeout);
};
exports.setInterval = function() {
  return new Timeout(apply.call(setInterval, window, arguments), clearInterval);
};
exports.clearTimeout =
exports.clearInterval = function(timeout) { timeout.close(); };

function Timeout(id, clearFn) {
  this._id = id;
  this._clearFn = clearFn;
}
Timeout.prototype.unref = Timeout.prototype.ref = function() {};
Timeout.prototype.close = function() {
  this._clearFn.call(window, this._id);
};

// Does not start the time, just sets up the members needed.
exports.enroll = function(item, msecs) {
  clearTimeout(item._idleTimeoutId);
  item._idleTimeout = msecs;
};

exports.unenroll = function(item) {
  clearTimeout(item._idleTimeoutId);
  item._idleTimeout = -1;
};

exports._unrefActive = exports.active = function(item) {
  clearTimeout(item._idleTimeoutId);

  var msecs = item._idleTimeout;
  if (msecs >= 0) {
    item._idleTimeoutId = setTimeout(function onTimeout() {
      if (item._onTimeout)
        item._onTimeout();
    }, msecs);
  }
};

// That's not how node.js implements it but the exposed api is the same.
exports.setImmediate = typeof setImmediate === "function" ? setImmediate : function(fn) {
  var id = nextImmediateId++;
  var args = arguments.length < 2 ? false : slice.call(arguments, 1);

  immediateIds[id] = true;

  nextTick(function onNextTick() {
    if (immediateIds[id]) {
      // fn.call() is faster so we optimize for the common use-case
      // @see http://jsperf.com/call-apply-segu
      if (args) {
        fn.apply(null, args);
      } else {
        fn.call(null);
      }
      // Prevent ids from leaking
      exports.clearImmediate(id);
    }
  });

  return id;
};

exports.clearImmediate = typeof clearImmediate === "function" ? clearImmediate : function(id) {
  delete immediateIds[id];
};
}).call(this,require("timers").setImmediate,require("timers").clearImmediate)
},{"process/browser.js":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/process/browser.js","timers":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/timers-browserify/main.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/uint64be/index.js":[function(require,module,exports){
var bufferAlloc = require('buffer-alloc')

var UINT_32_MAX = Math.pow(2, 32)

exports.encodingLength = function () {
  return 8
}

exports.encode = function (num, buf, offset) {
  if (!buf) buf = bufferAlloc(8)
  if (!offset) offset = 0

  var top = Math.floor(num / UINT_32_MAX)
  var rem = num - top * UINT_32_MAX

  buf.writeUInt32BE(top, offset)
  buf.writeUInt32BE(rem, offset + 4)
  return buf
}

exports.decode = function (buf, offset) {
  if (!offset) offset = 0

  var top = buf.readUInt32BE(offset)
  var rem = buf.readUInt32BE(offset + 4)

  return top * UINT_32_MAX + rem
}

exports.encode.bytes = 8
exports.decode.bytes = 8

},{"buffer-alloc":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/buffer-alloc/index.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/unordered-array-remove/index.js":[function(require,module,exports){
module.exports = remove

function remove (arr, i) {
  if (i >= arr.length || i < 0) return
  var last = arr.pop()
  if (i < arr.length) {
    var tmp = arr[i]
    arr[i] = last
    return tmp
  }
  return last
}

},{}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/unordered-set/index.js":[function(require,module,exports){
exports.add = add
exports.has = has
exports.remove = remove
exports.swap = swap

function add (list, item) {
  if (has(list, item)) return item
  item._index = list.length
  list.push(item)
  return item
}

function has (list, item) {
  return item._index < list.length && list[item._index] === item
}

function remove (list, item) {
  if (!has(list, item)) return null

  var last = list.pop()
  if (last !== item) {
    list[item._index] = last
    last._index = item._index
  }

  return item
}

function swap (list, a, b) {
  if (!has(list, a) || !has(list, b)) return
  var tmp = a._index
  a._index = b._index
  list[a._index] = a
  b._index = tmp
  list[b._index] = b
}

},{}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/util-deprecate/browser.js":[function(require,module,exports){
(function (global){

/**
 * Module exports.
 */

module.exports = deprecate;

/**
 * Mark that a method should not be used.
 * Returns a modified function which warns once by default.
 *
 * If `localStorage.noDeprecation = true` is set, then it is a no-op.
 *
 * If `localStorage.throwDeprecation = true` is set, then deprecated functions
 * will throw an Error when invoked.
 *
 * If `localStorage.traceDeprecation = true` is set, then deprecated functions
 * will invoke `console.trace()` instead of `console.error()`.
 *
 * @param {Function} fn - the function to deprecate
 * @param {String} msg - the string to print to the console when `fn` is invoked
 * @returns {Function} a new "deprecated" version of `fn`
 * @api public
 */

function deprecate (fn, msg) {
  if (config('noDeprecation')) {
    return fn;
  }

  var warned = false;
  function deprecated() {
    if (!warned) {
      if (config('throwDeprecation')) {
        throw new Error(msg);
      } else if (config('traceDeprecation')) {
        console.trace(msg);
      } else {
        console.warn(msg);
      }
      warned = true;
    }
    return fn.apply(this, arguments);
  }

  return deprecated;
}

/**
 * Checks `localStorage` for boolean values for the given `name`.
 *
 * @param {String} name
 * @returns {Boolean}
 * @api private
 */

function config (name) {
  // accessing global.localStorage can trigger a DOMException in sandboxed iframes
  try {
    if (!global.localStorage) return false;
  } catch (_) {
    return false;
  }
  var val = global.localStorage[name];
  if (null == val) return false;
  return String(val).toLowerCase() === 'true';
}

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/varint/decode.js":[function(require,module,exports){
module.exports = read

var MSB = 0x80
  , REST = 0x7F

function read(buf, offset) {
  var res    = 0
    , offset = offset || 0
    , shift  = 0
    , counter = offset
    , b
    , l = buf.length

  do {
    if(counter >= l) {
      read.bytes = 0
      read.bytesRead = 0 // DEPRECATED
      return undefined
    }
    b = buf[counter++]
    res += shift < 28
      ? (b & REST) << shift
      : (b & REST) * Math.pow(2, shift)
    shift += 7
  } while (b >= MSB)

  read.bytes = counter - offset

  return res
}

},{}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/varint/encode.js":[function(require,module,exports){
arguments[4]["/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hypercore-protocol/node_modules/varint/encode.js"][0].apply(exports,arguments)
},{}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/varint/index.js":[function(require,module,exports){
arguments[4]["/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hypercore-protocol/node_modules/varint/index.js"][0].apply(exports,arguments)
},{"./decode.js":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/varint/decode.js","./encode.js":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/varint/encode.js","./length.js":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/varint/length.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/varint/length.js":[function(require,module,exports){
arguments[4]["/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/hypercore-protocol/node_modules/varint/length.js"][0].apply(exports,arguments)
},{}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/websocket-stream/stream.js":[function(require,module,exports){
(function (process,global){
'use strict'

var Transform = require('readable-stream').Transform
var duplexify = require('duplexify')
var WS = require('ws')
var Buffer = require('safe-buffer').Buffer

module.exports = WebSocketStream

function buildProxy (options, socketWrite, socketEnd) {
  var proxy = new Transform({
    objectMode: options.objectMode
  })

  proxy._write = socketWrite
  proxy._flush = socketEnd

  return proxy
}

function WebSocketStream(target, protocols, options) {
  var stream, socket

  var isBrowser = process.title === 'browser'
  var isNative = !!global.WebSocket
  var socketWrite = isBrowser ? socketWriteBrowser : socketWriteNode

  if (protocols && !Array.isArray(protocols) && 'object' === typeof protocols) {
    // accept the "options" Object as the 2nd argument
    options = protocols
    protocols = null

    if (typeof options.protocol === 'string' || Array.isArray(options.protocol)) {
      protocols = options.protocol;
    }
  }

  if (!options) options = {}

  if (options.objectMode === undefined) {
    options.objectMode = !(options.binary === true || options.binary === undefined)
  }

  var proxy = buildProxy(options, socketWrite, socketEnd)

  if (!options.objectMode) {
    proxy._writev = writev
  }

  // browser only: sets the maximum socket buffer size before throttling
  var bufferSize = options.browserBufferSize || 1024 * 512

  // browser only: how long to wait when throttling
  var bufferTimeout = options.browserBufferTimeout || 1000

  // use existing WebSocket object that was passed in
  if (typeof target === 'object') {
    socket = target
  // otherwise make a new one
  } else {
    // special constructor treatment for native websockets in browsers, see
    // https://github.com/maxogden/websocket-stream/issues/82
    if (isNative && isBrowser) {
      socket = new WS(target, protocols)
    } else {
      socket = new WS(target, protocols, options)
    }

    socket.binaryType = 'arraybuffer'
  }

  // was already open when passed in
  if (socket.readyState === socket.OPEN) {
    stream = proxy
  } else {
    stream = stream = duplexify(undefined, undefined, options)
    if (!options.objectMode) {
      stream._writev = writev
    }
    socket.onopen = onopen
  }

  stream.socket = socket

  socket.onclose = onclose
  socket.onerror = onerror
  socket.onmessage = onmessage

  proxy.on('close', destroy)

  var coerceToBuffer = !options.objectMode

  function socketWriteNode(chunk, enc, next) {
    // avoid errors, this never happens unless
    // destroy() is called
    if (socket.readyState !== socket.OPEN) {
      next()
      return
    }

    if (coerceToBuffer && typeof chunk === 'string') {
      chunk = Buffer.from(chunk, 'utf8')
    }
    socket.send(chunk, next)
  }

  function socketWriteBrowser(chunk, enc, next) {
    if (socket.bufferedAmount > bufferSize) {
      setTimeout(socketWriteBrowser, bufferTimeout, chunk, enc, next)
      return
    }

    if (coerceToBuffer && typeof chunk === 'string') {
      chunk = Buffer.from(chunk, 'utf8')
    }

    try {
      socket.send(chunk)
    } catch(err) {
      return next(err)
    }

    next()
  }

  function socketEnd(done) {
    socket.close()
    done()
  }

  function onopen() {
    stream.setReadable(proxy)
    stream.setWritable(proxy)
    stream.emit('connect')
  }

  function onclose() {
    stream.end()
    stream.destroy()
  }

  function onerror(err) {
    stream.destroy(err)
  }

  function onmessage(event) {
    var data = event.data
    if (data instanceof ArrayBuffer) data = Buffer.from(data)
    else data = Buffer.from(data, 'utf8')
    proxy.push(data)
  }

  function destroy() {
    socket.close()
  }

  // this is to be enabled only if objectMode is false
  function writev (chunks, cb) {
    var buffers = new Array(chunks.length)
    for (var i = 0; i < chunks.length; i++) {
      if (typeof chunks[i].chunk === 'string') {
        buffers[i] = Buffer.from(chunks[i], 'utf8')
      } else {
        buffers[i] = chunks[i].chunk
      }
    }

    this._write(Buffer.concat(buffers), 'binary', cb)
  }

  return stream
}

}).call(this,require('_process'),typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"_process":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/process/browser.js","duplexify":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/duplexify/index.js","readable-stream":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/readable-stream/readable-browser.js","safe-buffer":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/safe-buffer/index.js","ws":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/websocket-stream/ws-fallback.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/websocket-stream/ws-fallback.js":[function(require,module,exports){

var ws = null

if (typeof WebSocket !== 'undefined') {
  ws = WebSocket
} else if (typeof MozWebSocket !== 'undefined') {
  ws = MozWebSocket
} else if (typeof window !== 'undefined') {
  ws = window.WebSocket || window.MozWebSocket
}

module.exports = ws

},{}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/wrappy/wrappy.js":[function(require,module,exports){
// Returns a wrapper function that returns a wrapped callback
// The wrapper function should do some stuff, and return a
// presumably different callback function.
// This makes sure that own properties are retained, so that
// decorations and such are not lost along the way.
module.exports = wrappy
function wrappy (fn, cb) {
  if (fn && cb) return wrappy(fn)(cb)

  if (typeof fn !== 'function')
    throw new TypeError('need wrapper function')

  Object.keys(fn).forEach(function (k) {
    wrapper[k] = fn[k]
  })

  return wrapper

  function wrapper() {
    var args = new Array(arguments.length)
    for (var i = 0; i < args.length; i++) {
      args[i] = arguments[i]
    }
    var ret = fn.apply(this, args)
    var cb = args[args.length-1]
    if (typeof ret === 'function' && ret !== cb) {
      Object.keys(cb).forEach(function (k) {
        ret[k] = cb[k]
      })
    }
    return ret
  }
}

},{}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/xsalsa20/index.js":[function(require,module,exports){
var xsalsa20 = require('./xsalsa20')()

var SIGMA = new Uint8Array([101, 120, 112, 97, 110, 100, 32, 51, 50, 45, 98, 121, 116, 101, 32, 107])
var head = 144
var top = head
var free = []

module.exports = XSalsa20

XSalsa20.NONCEBYTES = 24
XSalsa20.KEYBYTES = 32

function XSalsa20 (nonce, key) {
  if (!(this instanceof XSalsa20)) return new XSalsa20(nonce, key)
  if (!nonce || nonce.length < 24) throw new Error('nonce must be at least 24 bytes')
  if (!key || key.length < 32) throw new Error('key must be at least 32 bytes')
  this._xor = xsalsa20 && xsalsa20.exports ? new WASM(nonce, key) : new Fallback(nonce, key)
}

XSalsa20.prototype.update = function (input, output) {
  if (!input) throw new Error('input must be Uint8Array or Buffer')
  if (!output) output = new Uint8Array(input.length)
  if (input.length) this._xor.update(input, output)
  return output
}

XSalsa20.prototype.final =
XSalsa20.prototype.finalize = function () {
  this._xor.finalize()
  this._xor = null
}

function WASM (nonce, key) {
  if (!free.length) {
    free.push(head)
    head += 64
  }

  this._pointer = free.pop()
  this._nonce = this._pointer + 8
  this._key = this._nonce + 24
  this._overflow = 0

  xsalsa20.memory.fill(0, this._pointer, this._pointer + 8)
  xsalsa20.memory.set(nonce, this._nonce)
  xsalsa20.memory.set(key, this._key)
}

WASM.prototype.update = function (input, output) {
  var len = this._overflow + input.length
  var start = head + this._overflow

  top = head + len
  if (top >= xsalsa20.memory.length) xsalsa20.realloc(top)

  xsalsa20.memory.set(input, start)
  xsalsa20.exports.xsalsa20_xor(this._pointer, head, head, len, this._nonce, this._key)
  output.set(xsalsa20.memory.subarray(start, head + len))

  this._overflow = len & 63
}

WASM.prototype.finalize = function () {
  xsalsa20.memory.fill(0, this._pointer, this._key + 32)
  if (top > head) {
    xsalsa20.memory.fill(0, head, top)
    top = 0
  }
  free.push(this._pointer)
}

function Fallback (nonce, key) {
  this._s = new Uint8Array(32)
  this._z = new Uint8Array(16)
  this._overflow = 0
  core_hsalsa20(this._s, nonce, key, SIGMA)
  for (var i = 0; i < 8; i++) this._z[i] = nonce[i + 16]
}

Fallback.prototype.update = function (input, output) {
  var x = new Uint8Array(64)
  var u = 0
  var i = this._overflow
  var b = input.length + this._overflow
  var z = this._z
  var mpos = -this._overflow
  var cpos = -this._overflow

  while (b >= 64) {
    core_salsa20(x, z, this._s, SIGMA)
    for (; i < 64; i++) output[cpos + i] = input[mpos + i] ^ x[i]
    u = 1
    for (i = 8; i < 16; i++) {
      u += (z[i] & 0xff) | 0
      z[i] = u & 0xff
      u >>>= 8
    }
    b -= 64
    cpos += 64
    mpos += 64
    i = 0
  }
  if (b > 0) {
    core_salsa20(x, z, this._s, SIGMA)
    for (; i < b; i++) output[cpos + i] = input[mpos + i] ^ x[i]
  }

  this._overflow = b & 63
}

Fallback.prototype.finalize = function () {
  this._s.fill(0)
  this._z.fill(0)
}

// below methods are ported from tweet nacl

function core_salsa20(o, p, k, c) {
  var j0  = c[ 0] & 0xff | (c[ 1] & 0xff) << 8 | (c[ 2] & 0xff) << 16 | (c[ 3] & 0xff) << 24,
      j1  = k[ 0] & 0xff | (k[ 1] & 0xff) << 8 | (k[ 2] & 0xff) << 16 | (k[ 3] & 0xff) << 24,
      j2  = k[ 4] & 0xff | (k[ 5] & 0xff) << 8 | (k[ 6] & 0xff) << 16 | (k[ 7] & 0xff) << 24,
      j3  = k[ 8] & 0xff | (k[ 9] & 0xff) << 8 | (k[10] & 0xff) << 16 | (k[11] & 0xff) << 24,
      j4  = k[12] & 0xff | (k[13] & 0xff) << 8 | (k[14] & 0xff) << 16 | (k[15] & 0xff) << 24,
      j5  = c[ 4] & 0xff | (c[ 5] & 0xff) << 8 | (c[ 6] & 0xff) << 16 | (c[ 7] & 0xff) << 24,
      j6  = p[ 0] & 0xff | (p[ 1] & 0xff) << 8 | (p[ 2] & 0xff) << 16 | (p[ 3] & 0xff) << 24,
      j7  = p[ 4] & 0xff | (p[ 5] & 0xff) << 8 | (p[ 6] & 0xff) << 16 | (p[ 7] & 0xff) << 24,
      j8  = p[ 8] & 0xff | (p[ 9] & 0xff) << 8 | (p[10] & 0xff) << 16 | (p[11] & 0xff) << 24,
      j9  = p[12] & 0xff | (p[13] & 0xff) << 8 | (p[14] & 0xff) << 16 | (p[15] & 0xff) << 24,
      j10 = c[ 8] & 0xff | (c[ 9] & 0xff) << 8 | (c[10] & 0xff) << 16 | (c[11] & 0xff) << 24,
      j11 = k[16] & 0xff | (k[17] & 0xff) << 8 | (k[18] & 0xff) << 16 | (k[19] & 0xff) << 24,
      j12 = k[20] & 0xff | (k[21] & 0xff) << 8 | (k[22] & 0xff) << 16 | (k[23] & 0xff) << 24,
      j13 = k[24] & 0xff | (k[25] & 0xff) << 8 | (k[26] & 0xff) << 16 | (k[27] & 0xff) << 24,
      j14 = k[28] & 0xff | (k[29] & 0xff) << 8 | (k[30] & 0xff) << 16 | (k[31] & 0xff) << 24,
      j15 = c[12] & 0xff | (c[13] & 0xff) << 8 | (c[14] & 0xff) << 16 | (c[15] & 0xff) << 24

  var x0 = j0, x1 = j1, x2 = j2, x3 = j3, x4 = j4, x5 = j5, x6 = j6, x7 = j7,
      x8 = j8, x9 = j9, x10 = j10, x11 = j11, x12 = j12, x13 = j13, x14 = j14,
      x15 = j15, u

  for (var i = 0; i < 20; i += 2) {
    u = x0 + x12 | 0
    x4 ^= u << 7 | u >>> 25
    u = x4 + x0 | 0
    x8 ^= u << 9 | u >>> 23
    u = x8 + x4 | 0
    x12 ^= u << 13 | u >>> 19
    u = x12 + x8 | 0
    x0 ^= u << 18 | u >>> 14

    u = x5 + x1 | 0
    x9 ^= u << 7 | u >>> 25
    u = x9 + x5 | 0
    x13 ^= u << 9 | u >>> 23
    u = x13 + x9 | 0
    x1 ^= u << 13 | u >>> 19
    u = x1 + x13 | 0
    x5 ^= u << 18 | u >>> 14

    u = x10 + x6 | 0
    x14 ^= u << 7 | u >>> 25
    u = x14 + x10 | 0
    x2 ^= u << 9 | u >>> 23
    u = x2 + x14 | 0
    x6 ^= u << 13 | u >>> 19
    u = x6 + x2 | 0
    x10 ^= u << 18 | u >>> 14

    u = x15 + x11 | 0
    x3 ^= u << 7 | u >>> 25
    u = x3 + x15 | 0
    x7 ^= u << 9 | u >>> 23
    u = x7 + x3 | 0
    x11 ^= u << 13 | u >>> 19
    u = x11 + x7 | 0
    x15 ^= u << 18 | u >>> 14

    u = x0 + x3 | 0
    x1 ^= u << 7 | u >>> 25
    u = x1 + x0 | 0
    x2 ^= u << 9 | u >>> 23
    u = x2 + x1 | 0
    x3 ^= u << 13 | u >>> 19
    u = x3 + x2 | 0
    x0 ^= u << 18 | u >>> 14

    u = x5 + x4 | 0
    x6 ^= u << 7 | u >>> 25
    u = x6 + x5 | 0
    x7 ^= u << 9 | u >>> 23
    u = x7 + x6 | 0
    x4 ^= u << 13 | u >>> 19
    u = x4 + x7 | 0
    x5 ^= u << 18 | u >>> 14

    u = x10 + x9 | 0
    x11 ^= u << 7 | u >>> 25
    u = x11 + x10 | 0
    x8 ^= u << 9 | u >>> 23
    u = x8 + x11 | 0
    x9 ^= u << 13 | u >>> 19
    u = x9 + x8 | 0
    x10 ^= u << 18 | u >>> 14

    u = x15 + x14 | 0
    x12 ^= u << 7 | u >>> 25
    u = x12 + x15 | 0
    x13 ^= u << 9 | u >>> 23
    u = x13 + x12 | 0
    x14 ^= u << 13 | u >>> 19
    u = x14 + x13 | 0
    x15 ^= u << 18 | u >>> 14
  }
   x0 =  x0 +  j0 | 0
   x1 =  x1 +  j1 | 0
   x2 =  x2 +  j2 | 0
   x3 =  x3 +  j3 | 0
   x4 =  x4 +  j4 | 0
   x5 =  x5 +  j5 | 0
   x6 =  x6 +  j6 | 0
   x7 =  x7 +  j7 | 0
   x8 =  x8 +  j8 | 0
   x9 =  x9 +  j9 | 0
  x10 = x10 + j10 | 0
  x11 = x11 + j11 | 0
  x12 = x12 + j12 | 0
  x13 = x13 + j13 | 0
  x14 = x14 + j14 | 0
  x15 = x15 + j15 | 0

  o[ 0] = x0 >>>  0 & 0xff
  o[ 1] = x0 >>>  8 & 0xff
  o[ 2] = x0 >>> 16 & 0xff
  o[ 3] = x0 >>> 24 & 0xff

  o[ 4] = x1 >>>  0 & 0xff
  o[ 5] = x1 >>>  8 & 0xff
  o[ 6] = x1 >>> 16 & 0xff
  o[ 7] = x1 >>> 24 & 0xff

  o[ 8] = x2 >>>  0 & 0xff
  o[ 9] = x2 >>>  8 & 0xff
  o[10] = x2 >>> 16 & 0xff
  o[11] = x2 >>> 24 & 0xff

  o[12] = x3 >>>  0 & 0xff
  o[13] = x3 >>>  8 & 0xff
  o[14] = x3 >>> 16 & 0xff
  o[15] = x3 >>> 24 & 0xff

  o[16] = x4 >>>  0 & 0xff
  o[17] = x4 >>>  8 & 0xff
  o[18] = x4 >>> 16 & 0xff
  o[19] = x4 >>> 24 & 0xff

  o[20] = x5 >>>  0 & 0xff
  o[21] = x5 >>>  8 & 0xff
  o[22] = x5 >>> 16 & 0xff
  o[23] = x5 >>> 24 & 0xff

  o[24] = x6 >>>  0 & 0xff
  o[25] = x6 >>>  8 & 0xff
  o[26] = x6 >>> 16 & 0xff
  o[27] = x6 >>> 24 & 0xff

  o[28] = x7 >>>  0 & 0xff
  o[29] = x7 >>>  8 & 0xff
  o[30] = x7 >>> 16 & 0xff
  o[31] = x7 >>> 24 & 0xff

  o[32] = x8 >>>  0 & 0xff
  o[33] = x8 >>>  8 & 0xff
  o[34] = x8 >>> 16 & 0xff
  o[35] = x8 >>> 24 & 0xff

  o[36] = x9 >>>  0 & 0xff
  o[37] = x9 >>>  8 & 0xff
  o[38] = x9 >>> 16 & 0xff
  o[39] = x9 >>> 24 & 0xff

  o[40] = x10 >>>  0 & 0xff
  o[41] = x10 >>>  8 & 0xff
  o[42] = x10 >>> 16 & 0xff
  o[43] = x10 >>> 24 & 0xff

  o[44] = x11 >>>  0 & 0xff
  o[45] = x11 >>>  8 & 0xff
  o[46] = x11 >>> 16 & 0xff
  o[47] = x11 >>> 24 & 0xff

  o[48] = x12 >>>  0 & 0xff
  o[49] = x12 >>>  8 & 0xff
  o[50] = x12 >>> 16 & 0xff
  o[51] = x12 >>> 24 & 0xff

  o[52] = x13 >>>  0 & 0xff
  o[53] = x13 >>>  8 & 0xff
  o[54] = x13 >>> 16 & 0xff
  o[55] = x13 >>> 24 & 0xff

  o[56] = x14 >>>  0 & 0xff
  o[57] = x14 >>>  8 & 0xff
  o[58] = x14 >>> 16 & 0xff
  o[59] = x14 >>> 24 & 0xff

  o[60] = x15 >>>  0 & 0xff
  o[61] = x15 >>>  8 & 0xff
  o[62] = x15 >>> 16 & 0xff
  o[63] = x15 >>> 24 & 0xff
}

function core_hsalsa20(o,p,k,c) {
  var j0  = c[ 0] & 0xff | (c[ 1] & 0xff) << 8 | (c[ 2] & 0xff) << 16 | (c[ 3] & 0xff) << 24,
      j1  = k[ 0] & 0xff | (k[ 1] & 0xff) << 8 | (k[ 2] & 0xff) << 16 | (k[ 3] & 0xff) << 24,
      j2  = k[ 4] & 0xff | (k[ 5] & 0xff) << 8 | (k[ 6] & 0xff) << 16 | (k[ 7] & 0xff) << 24,
      j3  = k[ 8] & 0xff | (k[ 9] & 0xff) << 8 | (k[10] & 0xff) << 16 | (k[11] & 0xff) << 24,
      j4  = k[12] & 0xff | (k[13] & 0xff) << 8 | (k[14] & 0xff) << 16 | (k[15] & 0xff) << 24,
      j5  = c[ 4] & 0xff | (c[ 5] & 0xff) << 8 | (c[ 6] & 0xff) << 16 | (c[ 7] & 0xff) << 24,
      j6  = p[ 0] & 0xff | (p[ 1] & 0xff) << 8 | (p[ 2] & 0xff) << 16 | (p[ 3] & 0xff) << 24,
      j7  = p[ 4] & 0xff | (p[ 5] & 0xff) << 8 | (p[ 6] & 0xff) << 16 | (p[ 7] & 0xff) << 24,
      j8  = p[ 8] & 0xff | (p[ 9] & 0xff) << 8 | (p[10] & 0xff) << 16 | (p[11] & 0xff) << 24,
      j9  = p[12] & 0xff | (p[13] & 0xff) << 8 | (p[14] & 0xff) << 16 | (p[15] & 0xff) << 24,
      j10 = c[ 8] & 0xff | (c[ 9] & 0xff) << 8 | (c[10] & 0xff) << 16 | (c[11] & 0xff) << 24,
      j11 = k[16] & 0xff | (k[17] & 0xff) << 8 | (k[18] & 0xff) << 16 | (k[19] & 0xff) << 24,
      j12 = k[20] & 0xff | (k[21] & 0xff) << 8 | (k[22] & 0xff) << 16 | (k[23] & 0xff) << 24,
      j13 = k[24] & 0xff | (k[25] & 0xff) << 8 | (k[26] & 0xff) << 16 | (k[27] & 0xff) << 24,
      j14 = k[28] & 0xff | (k[29] & 0xff) << 8 | (k[30] & 0xff) << 16 | (k[31] & 0xff) << 24,
      j15 = c[12] & 0xff | (c[13] & 0xff) << 8 | (c[14] & 0xff) << 16 | (c[15] & 0xff) << 24

  var x0 = j0, x1 = j1, x2 = j2, x3 = j3, x4 = j4, x5 = j5, x6 = j6, x7 = j7,
      x8 = j8, x9 = j9, x10 = j10, x11 = j11, x12 = j12, x13 = j13, x14 = j14,
      x15 = j15, u

  for (var i = 0; i < 20; i += 2) {
    u = x0 + x12 | 0
    x4 ^= u << 7 | u >>> 25
    u = x4 + x0 | 0
    x8 ^= u << 9 | u >>> 23
    u = x8 + x4 | 0
    x12 ^= u << 13 | u >>> 19
    u = x12 + x8 | 0
    x0 ^= u << 18 | u >>> 14

    u = x5 + x1 | 0
    x9 ^= u << 7 | u >>> 25
    u = x9 + x5 | 0
    x13 ^= u << 9 | u >>> 23
    u = x13 + x9 | 0
    x1 ^= u << 13 | u >>> 19
    u = x1 + x13 | 0
    x5 ^= u << 18 | u >>> 14

    u = x10 + x6 | 0
    x14 ^= u << 7 | u >>> 25
    u = x14 + x10 | 0
    x2 ^= u << 9 | u >>> 23
    u = x2 + x14 | 0
    x6 ^= u << 13 | u >>> 19
    u = x6 + x2 | 0
    x10 ^= u << 18 | u >>> 14

    u = x15 + x11 | 0
    x3 ^= u << 7 | u >>> 25
    u = x3 + x15 | 0
    x7 ^= u << 9 | u >>> 23
    u = x7 + x3 | 0
    x11 ^= u << 13 | u >>> 19
    u = x11 + x7 | 0
    x15 ^= u << 18 | u >>> 14

    u = x0 + x3 | 0
    x1 ^= u << 7 | u >>> 25
    u = x1 + x0 | 0
    x2 ^= u << 9 | u >>> 23
    u = x2 + x1 | 0
    x3 ^= u << 13 | u >>> 19
    u = x3 + x2 | 0
    x0 ^= u << 18 | u >>> 14

    u = x5 + x4 | 0
    x6 ^= u << 7 | u >>> 25
    u = x6 + x5 | 0
    x7 ^= u << 9 | u >>> 23
    u = x7 + x6 | 0
    x4 ^= u << 13 | u >>> 19
    u = x4 + x7 | 0
    x5 ^= u << 18 | u >>> 14

    u = x10 + x9 | 0
    x11 ^= u << 7 | u >>> 25
    u = x11 + x10 | 0
    x8 ^= u << 9 | u >>> 23
    u = x8 + x11 | 0
    x9 ^= u << 13 | u >>> 19
    u = x9 + x8 | 0
    x10 ^= u << 18 | u >>> 14

    u = x15 + x14 | 0
    x12 ^= u << 7 | u >>> 25
    u = x12 + x15 | 0
    x13 ^= u << 9 | u >>> 23
    u = x13 + x12 | 0
    x14 ^= u << 13 | u >>> 19
    u = x14 + x13 | 0
    x15 ^= u << 18 | u >>> 14
  }

  o[ 0] = x0 >>>  0 & 0xff
  o[ 1] = x0 >>>  8 & 0xff
  o[ 2] = x0 >>> 16 & 0xff
  o[ 3] = x0 >>> 24 & 0xff

  o[ 4] = x5 >>>  0 & 0xff
  o[ 5] = x5 >>>  8 & 0xff
  o[ 6] = x5 >>> 16 & 0xff
  o[ 7] = x5 >>> 24 & 0xff

  o[ 8] = x10 >>>  0 & 0xff
  o[ 9] = x10 >>>  8 & 0xff
  o[10] = x10 >>> 16 & 0xff
  o[11] = x10 >>> 24 & 0xff

  o[12] = x15 >>>  0 & 0xff
  o[13] = x15 >>>  8 & 0xff
  o[14] = x15 >>> 16 & 0xff
  o[15] = x15 >>> 24 & 0xff

  o[16] = x6 >>>  0 & 0xff
  o[17] = x6 >>>  8 & 0xff
  o[18] = x6 >>> 16 & 0xff
  o[19] = x6 >>> 24 & 0xff

  o[20] = x7 >>>  0 & 0xff
  o[21] = x7 >>>  8 & 0xff
  o[22] = x7 >>> 16 & 0xff
  o[23] = x7 >>> 24 & 0xff

  o[24] = x8 >>>  0 & 0xff
  o[25] = x8 >>>  8 & 0xff
  o[26] = x8 >>> 16 & 0xff
  o[27] = x8 >>> 24 & 0xff

  o[28] = x9 >>>  0 & 0xff
  o[29] = x9 >>>  8 & 0xff
  o[30] = x9 >>> 16 & 0xff
  o[31] = x9 >>> 24 & 0xff
}

},{"./xsalsa20":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/xsalsa20/xsalsa20.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/xsalsa20/xsalsa20.js":[function(require,module,exports){

module.exports = loadWebAssembly

loadWebAssembly.supported = typeof WebAssembly !== 'undefined'

function loadWebAssembly (opts) {
  if (!loadWebAssembly.supported) return null

  var imp = opts && opts.imports
  var wasm = toUint8Array('AGFzbQEAAAABGgNgBn9/f39/fwBgBn9/f39+fwF+YAN/f38AAwcGAAEBAgICBQUBAQroBwcoAwZtZW1vcnkCAAx4c2Fsc2EyMF94b3IAAAxjb3JlX3NhbHNhMjAABArqEQYYACAAIAEgAiADIAQgACkDACAFEAE3AwALPQBB8AAgAyAFEAMgACABIAIgA0EQaiAEQfAAEAJB8ABCADcDAEH4AEIANwMAQYABQgA3AwBBiAFCADcDAAuHBQEBfyACQQBGBEBCAA8LQdAAIAUpAwA3AwBB2AAgBUEIaikDADcDAEHgACAFQRBqKQMANwMAQegAIAVBGGopAwA3AwBBACADKQMANwMAQQggBDcDAAJAA0AgAkHAAEkNAUEQQQBB0AAQBSAAIAEpAwBBECkDAIU3AwAgAEEIaiABQQhqKQMAQRgpAwCFNwMAIABBEGogAUEQaikDAEEgKQMAhTcDACAAQRhqIAFBGGopAwBBKCkDAIU3AwAgAEEgaiABQSBqKQMAQTApAwCFNwMAIABBKGogAUEoaikDAEE4KQMAhTcDACAAQTBqIAFBMGopAwBBwAApAwCFNwMAIABBOGogAUE4aikDAEHIACkDAIU3AwBBCEEIKQMAQgF8NwMAIABBwABqIQAgAUHAAGohASACQcAAayECDAALC0EIKQMAIQQgAkEASwRAQRBBAEHQABAFAkACQAJAAkACQAJAAkACQCACQQhuDgcHBgUEAwIBAAsgAEE4aiABQThqKQMAQcgAKQMAhTcDAAsgAEEwaiABQTBqKQMAQcAAKQMAhTcDAAsgAEEoaiABQShqKQMAQTgpAwCFNwMACyAAQSBqIAFBIGopAwBBMCkDAIU3AwALIABBGGogAUEYaikDAEEoKQMAhTcDAAsgAEEQaiABQRBqKQMAQSApAwCFNwMACyAAQQhqIAFBCGopAwBBGCkDAIU3AwALIAAgASkDAEEQKQMAhTcDAAtBEEIANwMAQRhCADcDAEEgQgA3AwBBKEIANwMAQTBCADcDAEE4QgA3AwBBwABCADcDAEHIAEIANwMAQdAAQgA3AwBB2ABCADcDAEHgAEIANwMAQegAQgA3AwAgBA8LnQUBEX9B5fDBiwYhA0HuyIGZAyEIQbLaiMsHIQ1B9MqB2QYhEiACKAIAIQQgAkEEaigCACEFIAJBCGooAgAhBiACQQxqKAIAIQcgAkEQaigCACEOIAJBFGooAgAhDyACQRhqKAIAIRAgAkEcaigCACERIAEoAgAhCSABQQRqKAIAIQogAUEIaigCACELIAFBDGooAgAhDEEUIRMCQANAIBNBAEYNASAHIAMgD2pBB3dzIQcgCyAHIANqQQl3cyELIA8gCyAHakENd3MhDyADIA8gC2pBEndzIQMgDCAIIARqQQd3cyEMIBAgDCAIakEJd3MhECAEIBAgDGpBDXdzIQQgCCAEIBBqQRJ3cyEIIBEgDSAJakEHd3MhESAFIBEgDWpBCXdzIQUgCSAFIBFqQQ13cyEJIA0gCSAFakESd3MhDSAGIBIgDmpBB3dzIQYgCiAGIBJqQQl3cyEKIA4gCiAGakENd3MhDiASIA4gCmpBEndzIRIgBCADIAZqQQd3cyEEIAUgBCADakEJd3MhBSAGIAUgBGpBDXdzIQYgAyAGIAVqQRJ3cyEDIAkgCCAHakEHd3MhCSAKIAkgCGpBCXdzIQogByAKIAlqQQ13cyEHIAggByAKakESd3MhCCAOIA0gDGpBB3dzIQ4gCyAOIA1qQQl3cyELIAwgCyAOakENd3MhDCANIAwgC2pBEndzIQ0gDyASIBFqQQd3cyEPIBAgDyASakEJd3MhECARIBAgD2pBDXdzIREgEiARIBBqQRJ3cyESIBNBAmshEwwACwsgACADNgIAIABBBGogCDYCACAAQQhqIA02AgAgAEEMaiASNgIAIABBEGogCTYCACAAQRRqIAo2AgAgAEEYaiALNgIAIABBHGogDDYCAAsKACAAIAEgAhAFC90GASF/QeXwwYsGIQNB7siBmQMhCEGy2ojLByENQfTKgdkGIRIgAigCACEEIAJBBGooAgAhBSACQQhqKAIAIQYgAkEMaigCACEHIAJBEGooAgAhDiACQRRqKAIAIQ8gAkEYaigCACEQIAJBHGooAgAhESABKAIAIQkgAUEEaigCACEKIAFBCGooAgAhCyABQQxqKAIAIQwgAyETIAQhFCAFIRUgBiEWIAchFyAIIRggCSEZIAohGiALIRsgDCEcIA0hHSAOIR4gDyEfIBAhICARISEgEiEiQRQhIwJAA0AgI0EARg0BIAcgAyAPakEHd3MhByALIAcgA2pBCXdzIQsgDyALIAdqQQ13cyEPIAMgDyALakESd3MhAyAMIAggBGpBB3dzIQwgECAMIAhqQQl3cyEQIAQgECAMakENd3MhBCAIIAQgEGpBEndzIQggESANIAlqQQd3cyERIAUgESANakEJd3MhBSAJIAUgEWpBDXdzIQkgDSAJIAVqQRJ3cyENIAYgEiAOakEHd3MhBiAKIAYgEmpBCXdzIQogDiAKIAZqQQ13cyEOIBIgDiAKakESd3MhEiAEIAMgBmpBB3dzIQQgBSAEIANqQQl3cyEFIAYgBSAEakENd3MhBiADIAYgBWpBEndzIQMgCSAIIAdqQQd3cyEJIAogCSAIakEJd3MhCiAHIAogCWpBDXdzIQcgCCAHIApqQRJ3cyEIIA4gDSAMakEHd3MhDiALIA4gDWpBCXdzIQsgDCALIA5qQQ13cyEMIA0gDCALakESd3MhDSAPIBIgEWpBB3dzIQ8gECAPIBJqQQl3cyEQIBEgECAPakENd3MhESASIBEgEGpBEndzIRIgI0ECayEjDAALCyAAIAMgE2o2AgAgAEEEaiAEIBRqNgIAIABBCGogBSAVajYCACAAQQxqIAYgFmo2AgAgAEEQaiAHIBdqNgIAIABBFGogCCAYajYCACAAQRhqIAkgGWo2AgAgAEEcaiAKIBpqNgIAIABBIGogCyAbajYCACAAQSRqIAwgHGo2AgAgAEEoaiANIB1qNgIAIABBLGogDiAeajYCACAAQTBqIA8gH2o2AgAgAEE0aiAQICBqNgIAIABBOGogESAhajYCACAAQTxqIBIgImo2AgAL')
  var ready = null

  var mod = {
    buffer: wasm,
    memory: null,
    exports: null,
    realloc: realloc,
    onload: onload
  }

  onload(function () {})

  return mod

  function realloc (size) {
    mod.exports.memory.grow(Math.ceil(Math.abs(size - mod.memory.length) / 65536))
    mod.memory = new Uint8Array(mod.exports.memory.buffer)
  }

  function onload (cb) {
    if (mod.exports) return cb()

    if (ready) {
      ready.then(cb.bind(null, null)).catch(cb)
      return
    }

    try {
      if (opts && opts.async) throw new Error('async')
      setup({instance: new WebAssembly.Instance(new WebAssembly.Module(wasm), imp)})
    } catch (err) {
      ready = WebAssembly.instantiate(wasm, imp).then(setup)
    }

    onload(cb)
  }

  function setup (w) {
    mod.exports = w.instance.exports
    mod.memory = mod.exports.memory && mod.exports.memory.buffer && new Uint8Array(mod.exports.memory.buffer)
  }
}

function toUint8Array (s) {
  if (typeof atob === 'function') return new Uint8Array(atob(s).split('').map(charCodeAt))
  return new (require('buf' + 'fer').Buffer)(s, 'base64')
}

function charCodeAt (c) {
  return c.charCodeAt(0)
}

},{}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/src/app.js":[function(require,module,exports){
const csjs = require('csjs-inject')
const makePage = require('makePage')
const setTheme = require('setTheme')

module.exports = app

function app ({ contracts, themes, cardsCount }) {
  setTheme(themes())
  const options = { db: contracts, themes: themes.names, cardsCount }
  return makePage(options, message => {
    const { type, data } = message
    if (type === 'theme') return setTheme(themes(data))
  })
}
const css = csjs`
@import url('https://fonts.googleapis.com/css?family=Nunito&display=swap');
@import url('https://fonts.googleapis.com/css?family=Inconsolata&display=swap');
html {
  font-size: 62.5%;
  height: 100%;
  scroll-behavior: smooth;
}
body {
  height: 100%;
  font-family: var(--main-font);
  font-size: var(--text-normal);
  margin: 0;
  padding: 0;
  color: var(--body-color);
  background-color: var(--body-background);
  overflow-x: hidden;
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
h1, h2, h3, h4, h5, h6, p {
  margin: 0;
}
h1 {
  font-size: var(--h1);
}
h2 {
  font-size: var(--h2);
}
h3 {
  font-size: var(--h3);
}
h4 {
  font-size: var(--h4);
}
h5 {
  font-size: var(--h5);
}
h6 {
  font-size: var(--h6);
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
svg {
  width: 100%;
  height: 100%;
} {
  font-size: var(--h1);
}
h2 {
  font-size: var(--h2);
}
h3 {
  font-size: var(--h3);
}
h4 {
  font-size: var(--h4);
}
h5 {
  font-size: var(--h5);
}
h6 {
  font-size: var(--h6);
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
svg {
  width: 100%;
  height: 100%;
}
@media screen and (prefers-reduced-motion: reduce) {
	html {
		scroll-behavior: auto;
	}
}
`

},{"csjs-inject":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/csjs-inject/index.js","makePage":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/src/node_modules/makePage.js","setTheme":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/src/node_modules/setTheme.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/src/node_modules/avatar.js":[function(require,module,exports){
const parser = document.createElement('div')
const script = document.createElement('script')
script.setAttribute('src', 'https://cdn.jsdelivr.net/npm/jdenticon@2.2.0')
document.head.appendChild(script)
var jdenticon
script.onload = () => {
  jdenticon = window.jdenticon
  delete window.jdenticon
}

module.exports = avatarGenerator

function avatarGenerator (data = 'hello world', size = 80) {
  parser.innerHTML = `<svg width="${size}" height="${size}" data-jdenticon-value="${data}"></svg>`
  const icon = parser.children[0]
  parser.innerHTML = ''
  if (jdenticon) jdenticon.update(icon, data + Math.random())
  return icon
}

},{}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/src/node_modules/copyToClipboard.js":[function(require,module,exports){
const bel = require('bel')
var csjs = require('csjs-inject')
const notification = require('notification')
const copy = require('copy-text-to-clipboard')
const icon = require('icon')
const svg = require('./svg.json')

module.exports = copyToClipboard

function copyToClipboard (hash) {
  const copyIcon = bel`
    <span class="${css['icon-duplicate']}" title="Copy address">
      ${icon('duplicate', svg.duplicate)}
    </span>`
  const message = "Contract address successfully copied"
  copyIcon.onclick = (event) => {
    event.stopPropagation()
    try {
      var copiableContent = hash
    } catch (e) {
      return notification({ type: 'error', body: 'copy failed: ' + e.message})
    }
    if (copiableContent) {
      copy(copiableContent)
      notification(message)
    }
  }
  return copyIcon
}
const css = csjs`
.icon-duplicate {
  cursor: pointer;
  position: absolute;
  right: 5px;
  bottom: -8px;
  width: 22px;
}
.icon-duplicate svg g {
  fill: var(--card-icon-fill);
}`

},{"./svg.json":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/src/node_modules/svg.json","bel":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/bel/browser.js","copy-text-to-clipboard":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/copy-text-to-clipboard/index.js","csjs-inject":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/csjs-inject/index.js","icon":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/src/node_modules/icon.js","notification":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/src/node_modules/notification.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/src/node_modules/filters.js":[function(require,module,exports){
const bel = require('bel')
const csjs = require('csjs-inject')
let activeFilter

module.exports = filters


function filters (names, notify) {
  return bel`<div class=${css.filterContainer}>
    ${names.map(name => button(name, notify))}</div>`
}

function button (name, notify) {
  const el = bel`<div class=${css.button} onclick=${(ev)=>filterFor(ev, name, notify)}>${name}</div>`
  if (name === 'All') makeActive(el)
  return el
}

function filterFor (ev, name, notify) {
  makeActive(ev.target)
  if (name === 'All') {
    return notify({ type: 'filters', body: 'All' })
  }
  if (name === 'Featured') {
    return notify({ type: 'filters', body: 'Featured' })
  }
  if (name === 'Basic') {
    return notify({ type: 'filters', body: 'Basic' })
  }
  if (name === 'OpenZeppelin') {
    return notify({ type: 'filters', body: 'OpenZeppelin' })
  }
  if (name === 'Audited') {
    return notify({ type: 'filters', body: 'Audited' })
  }
  if (name === 'New') {
    return notify({ type: 'filters', body: 'New' })
  }
  if (name === 'Popular') {
    return notify({ type: 'filters', body: 'Popular' })
  }
}

function makeActive (el) {
  if (activeFilter) activeFilter.classList.remove(css.active)
  activeFilter = el
  el.classList.add(css.active)
}

var css = csjs`
  .filterContainer {
    display: flex;
    flex-direction: row;
    justify-content: space-evenly;
    margin-bottom: 30px;
  }
  .button {}
  .button:hover {
    cursor: pointer;
    color: var(--card-cover-title);
  }
  .active {
    border-bottom: 2px solid var(--card-cover-title);
  }
`

},{"bel":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/bel/browser.js","csjs-inject":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/csjs-inject/index.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/src/node_modules/footer.js":[function(require,module,exports){
const bel = require('bel')
const csjs = require('csjs-inject')
const icon = require('icon')
const svg = require('./svg.json')

module.exports = footer

function footer() {
    const nav = bel`
    <nav class=${css["bottom-nav"]}>
        <span class=${css.rights}>© 2019</span>
        <a class="${css.button} ${css.link}" href="https://twitter.com/SmartContractC3" target="_blank">
            <span class="${css.icon} ${css['icon-twitter']}">${icon('twitter', svg.twitter)}</span>
        </a>
        <a class="${css.button} ${css.link}" href="https://github.com/ethereum-play/smartcontract.codes" target="_blank">
            <span class="${css.icon} ${css['icon-github']}">${icon('twitter', svg.github)}</span>
        </a>
        <a class="${css.button} ${css.link}" href="https://gitter.im/playproject-io/community" target="_blank">
            <span class="${css.icon} ${css['icon-gitter']}">${icon('twitter', svg.gitter)}</span>
        </a>
    </nav>`
    const el = bel`<footer class=${css.footer}>${nav}</footer>`
    return el


}

const css = csjs`
.footer {
    grid-area: footer;
    display: grid;
    justify-content: center;
    height: 44px;
}
.bottom-nav {
    display: grid;
    grid-template: 44px / repeat(4, auto);
    grid-gap: 20px;
    justify-content: center;
    align-items: center;
    border-radius: 4px;
    max-width: 230px;
    padding: 0 20px;
    background-color: var(--footer-nav-background);
}
.rights {
    font-size: 14px;
    color: var(--footer-copy-rights);
}
.button {

}
.link {

}
.icon {
    display: block;
    width: 20px;
    height: 20px;
}
.icon svg {
    width: 100%;
}
.icon svg g {
    fill: var(--footer-icon-fill);
    transition: fill .5s ease-in-out;
}
.icon:hover svg g {
    fill: var(--footer-icon-hover-fill)
}
.icon-gitter {}
.icon-github {}
.icon-twitter {}
`

},{"./svg.json":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/src/node_modules/svg.json","bel":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/bel/browser.js","csjs-inject":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/csjs-inject/index.js","icon":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/src/node_modules/icon.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/src/node_modules/footerSticker.js":[function(require,module,exports){
const bel = require('bel')
const csjs = require('csjs-inject')
const icon = require('icon')
const svg = require('./svg.json')

module.exports = footerSticker

function footerSticker() {
    return bel`
        <div class=${css.footerSticker}>
            <button class="${css.button} ${css.newContract}">
                <span class=${css['icon-new']} onclick=${openNew}>
                    ${icon('new', svg.new)}
                </span>
            </button>
        </div>

    `
}

function openNew () {
    window.open('https://ethereum-play.github.io/editor-solidity/')
}

const css = csjs`
.footerSticker {
    position: fixed;
    right: 16px;
    bottom: 16px;
    z-index: 9999;
}
.newContract {
    width: 44px;
    height: 44px;
    background-color: var(--button-sticker);
    -webkit-transition: background .3s ease-in-out;
    -moz-transition: background .3s ease-in-out;
    -o-transition: background .3s ease-in-out;
    transition: background .3s ease-in-out;
    border-radius: 50%;
    box-shadow: 0 10px 10px rgba(0, 0, 0, .4);
}
.newContract:hover {
    background-color: var(--button-sticker-hover);
}
.icon-new {
    display: block;
}
.icon-new svg g {
    fill: var(--icon-new-fill);
    transition: fill .3s ease-in-out;
    -webkit-transition: fill .3s ease-in-out;
    -moz-transition: fill .3s ease-in-out;
    -o-transition: fill .3s ease-in-out;
}

`

},{"./svg.json":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/src/node_modules/svg.json","bel":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/bel/browser.js","csjs-inject":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/csjs-inject/index.js","icon":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/src/node_modules/icon.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/src/node_modules/getCurrentPage.js":[function(require,module,exports){
module.exports = getCurrentPage

function getCurrentPage () {
  return parseInt(window.location.href.split('/?page=')[1]) || 1
}

},{}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/src/node_modules/header.js":[function(require,module,exports){
const bel = require('bel')
const csjs = require('csjs-inject')
const icon = require('icon')
const svg = require('./svg.json')
const search = require('search')
const makeCollectionArea = require('makeCollectionArea')
const themeSwitcher = require('themeSwitcher')
const getCurrentPage = require('getCurrentPage')
const makePagination = require('pagination')

module.exports = header

function header (db, notify) {
  let activeSession
  let count
  db.getPagesCount((err, res) => {
    count = res //@TODO get count to makePagination
  })

  function listenPagination (message) {
    const { type, data } = message
    if (type === 'paginate') return notify(message) 
  }

  return bel`<header class="${css.header}">
    <div class="${css.logo}" onclick=${home}>
      <img src="src/assets/images/logo-1.png" alt="smartcontract.codes">
    </div>
    ${search(action => {
        if (action.type === 'search') {
          const query = action.body
          const searchSession = { query, results: [], cards: 0 }
          if (activeSession) db.cancel(activeSession.id)
          searchSession.id = db.search( (query, action) => {
            listenSearch(searchSession, action)
          })
          activeSession = searchSession
        }
      })
    }
    <button class="${css.button} ${css.default} ${css.hamburger}" onclick=${() => menuOpen()}>
      <span class=${css['icon-hamburger']}>${icon('hamburger', svg.hamburger)}</span>
    </button>
    <nav class="${css.nav}">
      ${makePagination({ count: 500 }, listenPagination)}
      ${themeSwitcher(notify)}
      <a href="#">
        <span class="${css.avatar}">
          <img src="src/assets/images/user-avatar.jpg" alt="User Avatar">
        </span>
      </a>
      <button class="${css.button} ${css.default}">
        <span class=${css['apps']}>
          ${icon('apps', svg.apps)}
        </span>
      </button>
    </nav>
  </header>`
}
function home () {
  location.href = `${window.location.origin}${window.location.pathname}`
}

function menuOpen() {
  return
  const nav = document.querySelector(`.${css.nav}`)
  nav.style.display = 'block'
}
const css = csjs`
.header {
  display: grid;
  grid-template-rows: auto;
  grid-template-columns: 62px 1fr auto;
  padding: 10px 12px;
  background-color: var(--header-background);
  position: fixed;
  top: 0;
  left: 0;
  z-index: 99;
  width: calc(100% - 24px);
}
.logo {
  width: 62px;
}
.logo:hover {
  cursor: pointer;
}
.nav {
  display: grid;
  grid-template: 1fr / repeat(5, auto);
  grid-gap: 8px;
  justify-content: end;
  align-items: center;
}
.avatar {
  display: inline-block;
  width: 45px;
  height: 45px;
  border-radius: 100px;
  background-color: #333;
  overflow: hidden;
  margin-left: 15px;
}
.button {
  font-size: var(--button-default-font-size);
  vertical-align: middle;
  width: 36px;
  height: 36px;
}
.default {
  padding: 6px;
  color: var(--button-default-text);
  background-color: transparent;
  box-shadow: none;
  border: none;
  transition: background-color .3s ease-in-out;
  -webkit-transition: background-color .3s ease-in-out;
  -moz-transition: background-color .3s ease-in-out;
  -o-transition: background-color .3s ease-in-out;
}
.default:hover {
  background-color: var(--button-default-hover);
  color:  var(--button-default-text-hover);
  cursor: pointer;
}
.button span {
  display: inline-block;
  vertical-align: text-top;
}
.button span svg g {
  fill: var(--button-icon-fill);
  transition: fill .3s ease-in-out;
  -webkit-transition: fill .3s ease-in-out;
  -moz-transition: fill .3s ease-in-out;
  -o-transition: fill .3s ease-in-out;
}
.apps {
}
.icon-arrow-left,  .icon-arrow-right {
}
.hamburger {
  display: none;
}
.icon-hamburger {

}
@media (max-width: 960px) {
  .header {
    grid-template-columns: 62px 1fr auto;
    padding: 10px 2% 14px 2%;
    width: calc(100% - 4%);
  }
}
@media (max-width: 768px) {
  .nav {
    display: none;
  }
  .hamburger {
    display: none;
    align-self: center;
  }
}
`

},{"./svg.json":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/src/node_modules/svg.json","bel":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/bel/browser.js","csjs-inject":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/csjs-inject/index.js","getCurrentPage":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/src/node_modules/getCurrentPage.js","icon":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/src/node_modules/icon.js","makeCollectionArea":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/src/node_modules/makeCollectionArea.js","pagination":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/src/node_modules/pagination.js","search":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/src/node_modules/search.js","themeSwitcher":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/src/node_modules/themeSwitcher.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/src/node_modules/icon.js":[function(require,module,exports){
const bel = require('bel')

module.exports = icon

function icon (name, svg) {
  return bel`<svg viewBox="0 0 54 54">
    <g class=${name}>${svg.map(d => bel`<path d="${d}" />`)}</g>
  </svg>`
}

},{"bel":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/bel/browser.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/src/node_modules/loading.js":[function(require,module,exports){
const bel = require('bel')
const csjs = require('csjs-inject')

module.exports = loadingInProgress

function loadingInProgress () {
  return bel`<div class=${css.loading}></div>`
}

const css = csjs`
  .loading{
    position: relative;
    height: calc(100vh - 220px);
  }
  .loading:before,
  .loading:after,
  .loading>div{
    width:100px;
    height:100px;
    top:20%;
    left:48.5%;
    display:block;
    position:absolute;
    border-radius:50%;
    border:4px solid #6700ff
  }

  .loading:before
  {content:"";animation:scale 1s ease-in infinite}

  .loading:after
  {content:"";animation:scale 2s ease-in infinite}

  .loading>div{animation:scale 3s ease-in infinite}

  @keyframes scale{
  from{transform:translate(-50%,-50%) scale(0,0)}
  to{transform:translate(-50%,-50%) scale(1,1)}
  }
`

},{"bel":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/bel/browser.js","csjs-inject":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/csjs-inject/index.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/src/node_modules/makeCard.js":[function(require,module,exports){
const bel = require('bel')
const csjs = require('csjs-inject')
const icon = require('icon')
const svg = require('./svg.json')
const avatar = require('avatar')
const copyToClipboard = require('copyToClipboard')

module.exports = makeCard

function makeCard (contract) {
  const { source, title, hash } = contract
  const card = bel`
    <div class=${css.collectionCard}>
      <pre class=${css.code} onclick=${() => openInEditor(contract)}>
        <code>${source}</code>
      </pre>
      <div class=${css.cardCover}>
        <div class=${css.avatar}>
          ${avatar(hash)}
        </div>
        <div class=${css.coverInfo}>
          <h5 class=${css.coverTitle}>${title}</h5>
          <p class=${css.cardUserInfo}>${hash.substring(0,10)}...${hash.substring(hash.length-10), hash.substring(hash.length-10)}</p>
          ${copyToClipboard(hash)}
        </div>
      </div>
    </div>`
  return card
}



// ===== helpers =====
var editor_url = 'https://ethereum-play.github.io/editor-solidity/'
// var editor_url = 'https://10.0.2.15:9966/'
var counter = 1
const editors = {}

window.addEventListener('message', event => {
  const names = Object.keys(editors)
  const name = names.filter(name => editors[name].window === event.source)[0]
  const editor = editors[name]
  if (editor) {
    const [id, from, path, ref, type, body] = event.data
    if (type !== 'ready') return console.error('unexpected message', {id, from, path, ref, type, body})
    if (!editor.address) editor.address = from
    editor.window.postMessage([
      counter++,            // id (= message id)
      `/collection-page`,   // from
      editor.address,       // path
      0,                    // ref (=initiate new communucation)
      'open',               // type
      editor.contract       // body
    ], '*')
    editor.window.focus()
  }
})

function openInEditor (contract) {
  const name = `code-editor-${Object.keys(editors).length}`
  editors[name] = { name, contract, window: window.open(editor_url, name) }
}
const css = csjs`
  .collectionCard {
    width: 100%;
    height: 100%;
    border-radius: var(--collectionCard-border-radius);
    position: relative;
    background-color: var(--editor-preview);
    border: 0px solid var(--card-cover-border);
    transition: transform .4s, background-color .4s, border .4s, box-shadow .4s ease-in-out;
    -webkit-transition: transform .4s, background-color .4s, border .4s, box-shadow .4s ease-in-out;
    -moz-transition: transform .4s, background-color .4s, border .4s, box-shadow .4s ease-in-out;
    -o-transition: transform .4s, background-color .4s, border .4s, box-shadow .4s ease-in-out;
    box-shadow: var(--card-shadow);
    overflow: hidden;
  }
  .collectionCard:hover {
    transform: scale(1.1);
    -webkit-transform: scale(1.1);
    -ms-transform: scale(1.1);
    cursor: pointer;
    border: var(--card-hover-border);
    box-shadow: var(--card-hover-shadow);
    background: var(--card-code-overlay);
    z-index: 3;
  }
  .collectionCard:hover:before {
    opacity: 1;
  }
  .cardCover {
    position: relative;
    z-index: 3;
    cursor: auto;
    background-color: var(--card-cover);
    width: 100%;
    display: grid;
    grid-template-columns: 63px 1fr;
    grid-template-rows: 1fr auto;
    grid-column-gap: 5px;
    transition: bottom .3s, background-color .3s, border-radius .3s ease-in-out;
    -webkit-transition: bottom .3s, background-color .3s, border-radius .3s ease-in-out;
    -moz-transition: bottom .3s, background-color .3s, border-radius .3s ease-in-out;
    -o-transition: bottom .3s, background-color .3s, border-radius .3s ease-in-out;
    padding: 10px 0 8px 0;
    border-radius: 0 0 4px 4px;
  }
  .collectionCard:hover .cardCover {
    background-color: var(--card-hover-cover);
    border-radius: 4px;
  }
  .avatar {
    width: 43px;
    height: 43px;
    border-radius: 4px;
    overflow: hidden;
    align-self: center;
    justify-self: center;
  }
  .coverInfo {
    display: grid;
    grid-template-rows: auto auto;
    grid-template-columns: 1fr;
    position: relative;
  }
  .coverTitle {
    color: var(--card-cover-title);
    font-weight: normal;
    grid-row: 1;
    grid-column: 1;
    align-self: end;
    transition: color .3s ease-in-out;
    -webkit-transition: color .3s ease-in-out;
    -moz-transition: color .3s ease-in-out;
    -o-transition: color .3s ease-in-out;
  }
  .collectionCard:hover .coverTitle,  .collectionCard:hover .cardTime {
    color: var(--card-hover-cover-title);
  }
  .cardUserInfo {
    align-self: center;
    font-size: var(--text-xsmall);
    color: var(--card-cover-userInfo);
  }
  .code {
    width: calc(100% - 40px);
    height: calc(100% - 76px);
    margin: 0;
    padding: 0px 20px 15px 20px;
    word-break: break-all;
    word-wrap: break-word;
    white-space: pre-line;
    font-family: var(--code-font);
    font-size: var(--card-code-text);
    line-height: 20px;
    overflow: hidden;
  }
`

},{"./svg.json":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/src/node_modules/svg.json","avatar":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/src/node_modules/avatar.js","bel":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/bel/browser.js","copyToClipboard":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/src/node_modules/copyToClipboard.js","csjs-inject":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/csjs-inject/index.js","icon":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/src/node_modules/icon.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/src/node_modules/makeCollectionArea.js":[function(require,module,exports){
const bel = require('bel')
const csjs = require('csjs-inject')
const makeCard = require('makeCard')

module.exports = makeCollectionArea

function makeCollectionArea (contracts) {
  const cards = contracts.map(contract => makeCard(contract))
  return bel`<div class=${css.collectionArea}>${cards}</div>`
}
const css = csjs`
  .collectionArea {
    display: grid;
    grid-gap: var(--collectionArea-grid-gap);
    padding-bottom: 60px;
  }
  @media (max-width: 767px) {
    .collectionArea {
      grid-auto-rows: 250px;
    }
  }

  @media (min-width: 768px) {
    .collectionArea {
      grid-auto-rows: 250px;
      grid-template-columns: repeat(2, 1fr);
    }
  }

  @media (min-width: 1024px) {
    .collectionArea {
      grid-auto-rows: 250px;
      grid-template-columns: repeat(3, 1fr);
    }
  }

  @media (min-width: 1366px) {
    .collectionArea {
      grid-auto-rows: 280px;
      grid-template-columns: repeat(4, 1fr);
    }
  }

  @media (min-width: 1920px) {
    .collectionArea {
      grid-auto-rows: 300px;
      grid-template-columns: repeat(5, 1fr);
    }
  }

  @media (min-width: 2560px) {
    .collectionArea {
      grid-auto-rows: 350px;
      grid-template-columns: repeat(6, 1fr);
    }
  }
`

},{"bel":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/bel/browser.js","csjs-inject":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/csjs-inject/index.js","makeCard":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/src/node_modules/makeCard.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/src/node_modules/makePage.js":[function(require,module,exports){
const bel = require('bel')
const csjs = require('csjs-inject')
const header = require('header')
const search = require('search')
const loading = require('loading')()
const makePagination = require('pagination')
const makeCollectionArea = require('makeCollectionArea')
const makeCard = require('makeCard')
const filterButtons = require('filters')
const notification = require('notification')
const getCurrentPage = require('getCurrentPage')
const footerSticker = require('footerSticker')()
const footer = require('footer')()
const searchGuide = require('searchGuide')

module.exports = makePage

function makePage (data, notify) {
  const { db, themes,cardsCount } = data
  let activeSession
  const status = bel`<div></div>`
  const collectionContainer = bel`<div class=${css.container}></div>`
  // const navigation = bel`<div></div>`
  const viewport = bel`<meta name="viewport" content="width=device-width, initial-scale=1.0">`
  document.head.appendChild(viewport)
  const names = ['All', 'Basic', 'OpenZeppelin', 'Audited', 'Newest', 'Popular', 'Featured']

  const element = bel`
    <div class=${css.wrapper}>
        ${header(db, message => {
          let { type, data } = message
          if (type === 'theme') return notify(message)
          if (type = 'paginate') return listenPagination(data)
        })}
        <div class=${css.content}>
          ${searchGuide()}
          ${status}
          ${collectionContainer}
        </div>
        ${footerSticker}
        ${footer}
    </div>`

  function handleFilters (action) {
    if (action.type === 'filters') {
      const filter = action.body
      if (filter === 'All') {
        const query = ''
        console.log(`Starting search query: ${query}`)
        const searchSession = { query, results: [], cards: 0 }
        if (activeSession) db.cancel(activeSession.id)
        searchSession.id = db.search(query, action => {
          listenSearch(searchSession, action)
        })
        activeSession = searchSession
      } else {
        db.getSamples(filter, (err, sampleContracts) => {
          const contracts = sampleContracts[filter]
          collectionContainer.appendChild(loading)
          updatePagination(1)
          updateCollectionArea(contracts)
        })
      }
    }
  }

  function getBatch (currentPage) {
    db.getBatch(currentPage, cardsCount, (err, contracts) => {
      if (err) return console.error(err)
      else {
        if (activeSession) return
        collectionContainer.innerHTML = ''
        collectionContainer.appendChild(loading)
        updateCollectionArea(contracts)
      }
    })
  }
  getBatch(1)

  function getStream () {
    handleFilters({ type: 'filters', body: 'Basic' })
    console.log(`Initializing the P2P database`)
    setTimeout(() => {
      notification(`First visit detected. Initializing the P2P database
        will start soon!`)
    }, 3000)
    setTimeout(() => {
      notification('Please, hold on, this might take a few minutes!')
    }, 10000)
    setTimeout(() => {
      notification(`We're getting there. Initialization only needs
      to be done once!`)
    }, 25000)
    collectionContainer.appendChild(loading)
    db.getStream((err, data) => {
      if (err) return console.error(err)
      if (activeSession) return
      if (data === 'end') {
        localStorage.init = true
        notification(`P2P database is now initialized`)
      }
      getBatch(1)
    })
  }
  return element
  function listenPagination (page) {
    getBatch(page)
  }
  function listenSearch (session, action) {
    console.log(`Starting new search session: ${session.id}`)
    console.log(`Matches found: ${session.results.length}`)
    if (action.type === 'searchResult') {
      if (action.body != 'end') {
        console.log(`New search result: ${action.body}`)
        addMatch(session, action.body)
      } else {
        if (!session.area) {
          collectionContainer.innerHTML = ''
          const el = bel`<div class=${css.noResult}>No matches found</div>`
          collectionContainer.appendChild(el)
        }
      }
    }
  }
  function updateCollectionArea (contracts) {
    const collectionArea = makeCollectionArea(contracts)
    collectionContainer.innerHTML = ''
    collectionContainer.appendChild(collectionArea)
  }
  function addMatch (session, res) {
    const contract = {
      source: res.sourceCode,
      title: res.contractName,
      hash: res.address
    }
    if (!session.area) {
      collectionContainer.innerHTML = ''
      session.area = makeCollectionArea([])
      collectionContainer.appendChild(session.area)
    }
    session.results.push(contract)
    const length = session.results.length
    const count = Math.floor(length/cardsCount)
    if (length <= cardsCount) {
      console.log(`Appending new card`)
      session.cards++
      session.area.appendChild(makeCard(contract))
    }
    if (session.cards === cardsCount) {
      console.log(`Creating fresh pagination`)
      if (!session.pagination) {
        session.pagination = true
        updatePagination(count)
      }
      if (length % cardsCount === 0) {
        updatePagination(count)
        console.log(`Updating pagination (total): ${length}`)
      }
    }
  }

  function updatePagination (count) {
    const pagination = makePagination({ count }, listenPagination)
    navigation.innerHTML = ''
    navigation.appendChild(pagination)
  }

  function clickAction() { location.url = '' }
  function closeAction() { location.url = '' }
}
const css = csjs`
  .wrapper {
    height: 100%;
  }
  .status {
    height: 100px;
  }
  .noResult {
    font-size: var(--text-large);
    text-align: center;
    margin-bottom: 60px;
    font-weight: 200;
  }
  .content {
    padding: 88px 30px 0 30px;
    min-height: calc(100% - 134px);
  }
  .container {
    position: relative;
    height: 100%;
  }
  @media (max-width: 420px) {
    .wrapper {
      padding: 0 20px;
    }
    .content {
      padding: 88px 0 0 0;
    }
  }
`

},{"bel":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/bel/browser.js","csjs-inject":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/csjs-inject/index.js","filters":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/src/node_modules/filters.js","footer":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/src/node_modules/footer.js","footerSticker":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/src/node_modules/footerSticker.js","getCurrentPage":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/src/node_modules/getCurrentPage.js","header":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/src/node_modules/header.js","loading":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/src/node_modules/loading.js","makeCard":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/src/node_modules/makeCard.js","makeCollectionArea":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/src/node_modules/makeCollectionArea.js","notification":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/src/node_modules/notification.js","pagination":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/src/node_modules/pagination.js","search":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/src/node_modules/search.js","searchGuide":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/src/node_modules/searchGuide.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/src/node_modules/notification.js":[function(require,module,exports){
const bel = require('bel')
const csjs = require('csjs-inject')

var notifyModal

module.exports = notify

function notify (msg) {
  if (!notifyModal) {
    notifyModal = bel`<div id="notify" class=${css.notifyModal}"></div>`
    document.body.appendChild(notifyModal)
  }
  if (typeof msg === 'string') msg = { type: 'ok', body: msg }
  if (msg.type === 'error') console.error(msg.body)
  const notification = bel`<div class="${css.notify} ${css.show}">
    ${msg.body}
  </div>`
  notifyModal.appendChild(notification)
  setTimeout(function(){
    notification.classList.remove(css.show)
    notification.classList.add(css.hide)
    setTimeout(() => notifyModal.removeChild(notification), 900)
  }, 2500)
}

const css = csjs`
.notify {
  width: 30%;
  margin-bottom: 5px;
  padding: 8px;
  text-align: center;
  border-radius: 4px;
  -webkit-box-shadow: 0 3px 5px -1px rgba(0,0,0,.2), 0 6px 10px 0 rgba(0,0,0,.14), 0 1px 18px 0 rgba(0,0,0,.12);
  box-shadow: 0 3px 5px -1px rgba(0,0,0,.2), 0 6px 10px 0 rgba(0,0,0,.14), 0 1px 18px 0 rgba(0,0,0,.12);
  background-color: var(--notify-background-color);
  color: #000;
  font-size: 1.4rem;
}
.notifyModal {
  position: fixed;
  left: 0;
  bottom: 20px;
  width: 100%;
  display: grid;
  justify-items: center;
  z-index:999;
}
.show {
  animation: show 1s
}
.hide {
  animation: hide 1s
}
@keyframes show {
  from { opacity: 0}
  to { opacity: 1}
}
@keyframes hide {
  from { opacity: 1}
  to { opacity: 0}
}
@media (max-width: 960px) {
  .notify {
    width: 50%;
  }
}
@media (max-width: 768px) {
  .notify {
    width: 65%;
  }
}`

},{"bel":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/bel/browser.js","csjs-inject":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/csjs-inject/index.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/src/node_modules/pagination.js":[function(require,module,exports){
const bel = require('bel')
const csjs = require('csjs-inject')
const icon = require('icon')
const svg = require('svg')
const getCurrentPage = require('getCurrentPage')

module.exports = pagination

function pagination ({ count }, notify) {
  if (!count) return
  let now = getCurrentPage()
  let pagination = makePagination()
  function makePagination () {
    let input = bel`<input type="text" value=${now} class=${css.number}>`
    input.addEventListener('focusout', (e) => selectPage(e))
    input.addEventListener('keydown', (e) => detectKey(e))
    return bel`
      <div class=${css.pagination}>
        <button class="${css.button} ${css.default} ${css.previous}" onclick=${() => prev(input)}>
          <span class=${css['icon-arrow-left']}>${icon('arrow-left', svg.arrowLeft)}</span>
        </button>
        <div class=${css.pageInfo}>
          ${input} / ${count}
        </div>
        <button class="${css.button} ${css.default} ${css.next}" onclick=${() => next(input)}>
          <span class=${css['icon-arrow-right']}>${icon('arrow-left', svg.arrowRight)}</span>
        </button>
      </div>`
  }
  function detectKey (e) {
    const val = e.target.value
    var keyCode = e.keyCode || e.which
    if (keyCode == '13') gotoPage(Number(val))
  }
  function selectPage (e) {
    const val = e.target.value
    gotoPage(Number(val))
  }
  function prev (input) {
    if (now != 1) {
      input.value = now - 1
      gotoPage(now - 1)
    }
  }
  function next (input) {
    if (now != count) {
      input.value = now + 1
      gotoPage(now + 1)
    }
  }
  function gotoPage (newPage) {
    now = newPage
    if (!now) return
    const base = getCurrentPage() != 1 ?
     `${window.location.origin}${window.location.pathname}`.split('/?page=')[0]
     : `${window.location.origin}${window.location.pathname}`.split(' ')[0]
    let url = base + `?page=${newPage}`
    history.pushState(null, null, url)
    notify({ type: 'paginate', data: newPage })
  }
  return pagination
}
const css = csjs`
  .pagination {
    display: grid;
    grid-template: 1fr / 1fr auto 1fr;
    grid-gap: 5px;
    padding-right: 30px;
  }
  .button {
    font-size: var(--button-default-font-size);
    vertical-align: middle;
    width: 36px;
    height: 36px;
  }
  .pageInfo {
    font-size: 14px;
  }
  .number {
    font-size: 14px;
    text-align: center;
    border-radius: 4px;
    border: var(--number-border);
    color: var(--number-color);
    background-color: var(--number-background);
    padding: 8px 6px;
    margin-right: 5px;
    max-width: 50px;
  }
  .default {
    padding: 6px;
    color: var(--button-default-text);
    background-color: transparent;
    box-shadow: none;
    border: none;
    transition: background-color .3s ease-in-out;
    -webkit-transition: background-color .3s ease-in-out;
    -moz-transition: background-color .3s ease-in-out;
    -o-transition: background-color .3s ease-in-out;
  }
  .default:hover {
    background-color: var(--button-default-hover);
    color:  var(--button-default-text-hover);
    cursor: pointer;
  }
  .button span {
    display: inline-block;
    vertical-align: text-top;
  }
  .button span svg g {
    fill: var(--button-icon-fill);
    transition: fill .3s ease-in-out;
    -webkit-transition: fill .3s ease-in-out;
    -moz-transition: fill .3s ease-in-out;
    -o-transition: fill .3s ease-in-out;
  }
  .previous {
    border: none;
    background: transparent;
  }
  .next {
    border: none;
    background: transparent;
  }
  .pages {
    margin: 0 10px;
    display: inline-grid;
    grid-template: var(--grid-template);
    justify-content: center;
    justify-items: center;
    align-items: center;
  }
  .pages li {
    font-size: var(--text-small);
  }
  .dotdotdot {
    padding: 4px 8px;
    color: var(--pages-text);
  }
  .nonactive {
    border-radius: var(--pages-text-border-radius);
    padding: 4px 8px;
    border: var(--pages-border);
    color: var(--pages-text);
  }
  .nonactive:hover {
    background: var(--pages-hover-background);
    cursor: pointer;
  }
  .active {
    border-radius: var(--pages-text-border-radius);
    padding: 4px 8px;
    background: var(--pages-current-background);
    color: var(--pages-text-active);
  }
  @media (max-width: 768px) {
    .pages {
      display: none;
    }
    .previous {
      justify-self: start;
    }
  }
`

},{"bel":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/bel/browser.js","csjs-inject":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/csjs-inject/index.js","getCurrentPage":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/src/node_modules/getCurrentPage.js","icon":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/src/node_modules/icon.js","svg":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/src/node_modules/svg.json"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/src/node_modules/search.js":[function(require,module,exports){
const bel = require('bel')
const csjs = require('csjs-inject')
const icon = require('icon')
const svg = require('./svg.json')
const unfocusElement = require('unfocusElement')
module.exports = search

let isExpanded = false
let searchContent = ''
let shortInfo = ''

function search (notify) {

  const searchArea = bel`<div contenteditable="true"
    placeholder='Enter a keyword, contract name or code snippet'
    class=${css.textarea}"
    onclick=${(e) => select(e)}
    onkeyup=${(e) => trigger(e)}
    onpaste=${(e) => paste(e)}
    onkeydown=${(e) => down(e)}
    onkeypress=${(e) => preventDefault(e)}>
    >
  </div>`

  unfocusElement(x => x === searchArea, (hasFocus) => {

    // console.log('[search bar]', hasFocus ? 'click inside' : 'click outside')
    if (hasFocus) return
    isExpanded = false
    if (searchArea.clientHeight > 40 ) {
      searchArea.style.overflow = 'hidden'
      searchArea.scrollTop = 0
    }
    searchArea.classList.remove(css.focus)
    searchArea.classList.add(css.ellipsis)

    if (shortInfo == '' && searchContent == '') {
      searchArea.setAttribute('placeholder', 'Enter a keyword, contract name or code snippet')
      return clearSearch()
    } else {
      searchArea.removeAttribute('placeholder')
      searchArea.innerText = shortInfo
    }
  })

  return bel`
  <div class=${css.searchBar}>
    ${searchArea}
    <button class="button ${css.submit}"
      onclick=${()=>searchContracts(searchArea, notify)}>
      <span class="${css['icon-search']}">
          ${icon('search', svg.search)}
        </span>
    </button>
  </div>`

  function select (el) {
    isExpanded = !isExpanded
    searchArea.focus()
    if (isExpanded) {
      if (!searchArea.classList.contains(css.focus)) {
        searchArea.classList.add(css.focus)
        searchArea.classList.remove(css.ellipsis)
        searchArea.style.overflowY = 'auto'
        searchArea.innerHTML = searchContent

        const range = document.createRange()
        range.selectNodeContents(el.target)
        const sel = window.getSelection()
        sel.removeAllRanges()
        sel.addRange(range)
      }
    }
  }

  function trigger (e, ops) {
    const keyCode = e.keyCode
    searchContent = searchArea.innerHTML
    shortInfo = searchArea.innerText.split('\n').shift()
    document.execCommand("defaultParagraphSeparator", false, "br")
    if (keyCode === 13 && !e.shiftKey) return searchContracts(searchArea, notify)
    // if (keyCode === 27) return clearSearch()
    // esc
    if (keyCode === 27) {
      isExpanded = false
      searchArea.classList.remove(css.focus)
      searchArea.classList.add(css.ellipsis)
      searchArea.style.overflow = 'hidden'

      if (shortInfo === '' && searchArea.textContent === '') {
          searchArea.setAttribute('placeholder', 'Enter a keyword, contract name or code snippet')
          searchContent = ''
          searchArea.blur()
          return clearSearch()
      } else {
        searchArea.removeAttribute('placeholder')
        searchArea.innerText = shortInfo
      }
      searchArea.blur()
      removeSelection()
    }
    // delete
    if (keyCode === 8 || keyCode === 46 ) {
      if (shortInfo === '' && searchArea.textContent === '') {
          searchArea.setAttribute('placeholder', 'Enter a keyword, contract name or code snippet')
          searchContent = ''
          return clearSearch()
      } else {
          searchArea.setAttribute('placeholder', '')
      }
    }
  }
  function paste(event) {
    let paste = (event.clipboardData || window.clipboardData).getData('text')
    const selection = window.getSelection()
    if (!selection.rangeCount) return false
    selection.deleteFromDocument()
    selection.getRangeAt(0).insertNode(document.createTextNode(paste))
    event.preventDefault()
    trigger()
  }
  function down(e) {
    const keyCode = e.which || e.keyCode
    // tab
    if (keyCode === 9) {
      e.preventDefault()
      document.execCommand('insertHTML', false, '&#009')
    }
  }
  function removeSelection() {
    if (window.getSelection) {
      let selection = window.getSelection()
      selection.removeAllRanges()
    }
  }

  function clearSearch () {
    shortInfo = ''
    searchContent = ''
    searchArea.innerHTML = ''
  }
}

// ===== helpers =====

function getSearchInput (searchArea) {
  return searchArea.innerText
}

function preventDefault (e) {
  const keyCode = e.keyCode
  if (keyCode === 13 && !e.shiftKey) e.preventDefault()
}

function searchContracts (searchArea, notify) {
  const query = getSearchInput(searchArea)
  return notify({ type: 'search', body: query })
}

function getMatches (contracts, val) {
  let match = []
  let formattedContracts = [...contracts]
  for(var i=0; i<contracts.length; i++) {
    let temp = formattedContracts[i].replace(/\n. |\r/g, "")
    let contract = contracts[i]
    if (temp.includes(val)) match.push(contract)
  }
  return match
}

// ===== css =====

const css = csjs`
  .noResult {
    font-size: var(--text-large);
    text-align: center;
    margin-bottom: 60px;
    font-weight: 200;
  }
  .searchBar {
    position: relative;
    display: grid;
    justify-content: end;
    align-items: start;
    padding-top: 13px;
    max-width: 620px;
  }
  .submit {
    width: 42px;
    height: 42px;
    background-color: var(--search-button-background);
    cursor: pointer;
    border-radius: 6px;
    transition: all .3s ease-in-out;
    -webkit-transition: background-color .3s ease-in-out;
    -moz-transition: background-color .3s ease-in-out;
    -o-transition: background-color .3s ease-in-out;
  }
  .submit:hover {
    color: var(--search-button-color);
    background-color: var(--search-button-hover-background);
  }
  [contenteditable=true]:empty::before {
    content: attr(placeholder);
    color: var(--placeholder);
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .textarea {
    position: absolute;
    left: 0;
    top: 13px;
    z-index: 101;
    width: calc(100% - 70px);
    max-height: 20px;
    overflow: hidden;
    font-size: var(--search-input-text);
    font-family: var(--code-font);
    line-height: var(--search-input-line-height);
    padding: 10px;
    color: var(--body-color);
    border-radius: 6px;
    border: var(--search-input);
    background: var(--search-input-background);
    white-space: pre-wrap;
    outline: none;
    transition: box-shadow .3s, height .5s, max-height .5s ease-in-out;
  }
  .icon-search {
    display: inline-block;
  }
  .icon-search svg g {
    fill: var(--card-icon-fill);
  }
  .focus {
    box-shadow: 0 6px 20px var(--search-input-shadow);
    height: auto;
    min-height: 20px;
    max-height: 250px;
  }
  .ellipsis {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    height: 20px;
  }
  .open {
    display: grid;
    visibility: visible;
    animation: on .25s ease-in forwards;
  }
  .close {
    animation: off .25s ease-out forwards
  }
  @keyframes on {
    0% {
      opacity: 0;
    }
    100% {
      opacity: 1;
    }
  }
  @keyframes off {
    0% {
      visibility: visible;
      opacity: 1;
    }
    100% {
      visibility: hidden;
      opacity: 0;
    }
  }
`

},{"./svg.json":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/src/node_modules/svg.json","bel":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/bel/browser.js","csjs-inject":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/csjs-inject/index.js","icon":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/src/node_modules/icon.js","unfocusElement":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/src/node_modules/unfocusElement.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/src/node_modules/searchGuide.js":[function(require,module,exports){
const bel = require('bel')
const csjs = require('csjs-inject')
const icon = require('icon')
const svg = require('./svg.json')

module.exports = searchGuide

function searchGuide() {
    let filters = ["Beginner", "Basic", "OpenZeppelin", "Featured"]
    let searchFilters =  filters.map( (name, index) => {
        let el = bel`<li><a href="#" class=${css.tab} onclick=${(e) => toggle(e)}>${name}</a></li>`
        if ( index === 0 ) {
            el.firstChild.classList.add(css.active)
        }
        return el
    })
    let list = bel`<ul class=${css.filterList}>${searchFilters}</ul>`
    const arrowLeft = bel`
                    <button class="${css.button} ${css.circle} ${css['arrow-left']}" onclick=${(e) => prev()}>
                        <span class=${css['icon-arrow-left']}>${icon('arrow-left', svg.arrowLeft)}</span>
                    </button>`
    const arrowRight = bel`
                    <button class="${css.button} ${css.circle} ${css['arrow-right']}" onclick=${(e) => next()}>
                        <span class=${css['icon-arrow-right']}>${icon('arrow-left', svg.arrowRight)}</span>
                    </button>`

    let scrolled = 0
    window.onload = function() {
        showRightArrow()
    }

    window.onresize = function() {
        showRightArrow()
    }

    const tabs = bel`
    <nav class=${css.searchGuide}>
      ${arrowLeft}
      <div class=${css.searchContainer}>
        ${list}
      </div>
      ${arrowRight}
    </nav>`

    return tabs

    function toggle(e) {
        e.target.classList.toggle(css.active)
    }
    function showRightArrow() {
        let screen = document.body.clientWidth
        let listWidth = list.offsetWidth
        if (listWidth < list.parentNode.clientWidth) {
            arrowRight.style.display = 'none'
            arrowLeft.style.display = 'none'
        } else {
            arrowRight.style.display = 'block'
            if (screen <= 480) {
                arrowRight.style.display = 'none'
                arrowLeft.style.display = 'none'
            }
        }
    }
    function prev() {
        list.parentNode.scrollLeft -= list.parentNode.clientWidth
        scrolled -= document.body.clientWidth
        list.parentNode.scrollLeft = scrolled
        if (scrolled <= 0) {
            arrowLeft.style.display = 'none'
            scrolled = 0
        }
        arrowRight.style.display = 'block'

    }
    function next() {
        let maxScrollLeft = list.parentNode.scrollWidth - list.parentNode.clientWidth
        scrolled += document.body.clientWidth
        list.parentNode.scrollLeft = scrolled
        if (scrolled > 0) arrowLeft.style.display = 'block'
        if (scrolled >= maxScrollLeft) {
            arrowRight.style.display = 'none'
            scrolled = maxScrollLeft
        }
    }
}

const css = csjs`
.searchGuide {
    position: relative;
    display: grid;
    grid-template: 80px / auto;
    grid-gap: 10px;
    align-items: center;
}
.searchContainer {
    display: flex;
    height: 100%;
    overflow: hidden;
    scroll-behavior: smooth;
    -webkit-overflow-scrolling: touch;
}
.filterList {
    display: flex;
    flex-wrap: nowrap;
    align-items: center;
    -webkit-overflow-scrolling: touch;
}
.filterList li {
}
.tab {
    display: inline-block;
    margin-right:12px;
    padding:8px 34px 9px 34px;
    font-size: 14px;
    font-weight: bold;
    color: var(--tab-color);
    background-color: var(--tab-background);
    border-radius: 18px;
    border: 1px solid var(--tab-border-color);
    transform: scale(1);
    transition: color .3s, background-color .6s, transform .2s ease-in-out;
    white-space: nowrap;
}
.filterList li:lastChild .tab {
    margin-right: 0;
}
.active, .active:hover {
    color: var(--tab-active-color);
    background-color: var(--tab-active-background);
    box-shadow: 0 6px 8px var(--tab-active-box-shadow);
    transform: scale(1);
}
.button {
    width: 36px;
    height: 36px;
    background-color: white;
}
.button span {
    display: inline-block;
    vertical-align: text-top;
}
.button svg {
    width: 100%;
}
.default {
    padding: 6px;
    color: var(--button-default-text);
    background-color: transparent;
    box-shadow: none;
    border: none;
    transition: background-color .3s ease-in-out;
    -webkit-transition: background-color .3s ease-in-out;
    -moz-transition: background-color .3s ease-in-out;
    -o-transition: background-color .3s ease-in-out;
}
.default:hover {
    background-color: var(--button-default-hover);
    color:  var(--button-default-text-hover);
    cursor: pointer;
}
.default svg g {
    fill: var(--button-icon-fill);
    transition: fill .3s ease-in-out;
    -webkit-transition: fill .3s ease-in-out;
    -moz-transition: fill .3s ease-in-out;
    -o-transition: fill .3s ease-in-out;
}
.circle {
    width: 50px;
    height: 50px;
    border-radius: 50%;
}
.circle svg g {
    fill: black;
    transition: fill .3s ease-in-out;
    -webkit-transition: fill .3s ease-in-out;
    -moz-transition: fill .3s ease-in-out;
    -o-transition: fill .3s ease-in-out;
}
.arrow-left {
    display: none;
    position: absolute;
    top: 12px;
    left: -30px;
    z-index: 2;
}
.arrow-right {
    display: none;
    position: absolute;
    top: 12px;
    right: -30px;
    z-index: 2;
}
.icon-arrow-left, .icon-arrow-right {
}
@media (max-width: 768px) {
    .tab {
        padding:8px 22px 9px 22px;
        margin-right: 10px;
    }
}
@media (max-width: 480px) {
    .searchContainer {
        overflow: auto;
    }
    .button.circle {
        display: none;
    }
}
`

},{"./svg.json":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/src/node_modules/svg.json","bel":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/bel/browser.js","csjs-inject":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/csjs-inject/index.js","icon":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/src/node_modules/icon.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/src/node_modules/setTheme.js":[function(require,module,exports){
module.exports = setTheme

function setTheme (theme) {
  const element = document.documentElement
  let arr = Object.keys(theme)
  for (var i = 0; i < arr.length; i++) {
    const key = arr[i]
    const value = theme[key]
    element.style.setProperty(key, value)
  }
}

},{}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/src/node_modules/svg.json":[function(require,module,exports){
module.exports={
  "new": ["M46.39,27H29.49V10.05a1.25,1.25,0,0,0-2.5,0V27H10.11a1.25,1.25,0,0,0,0,2.5H27v17a1.25,1.25,0,0,0,2.5,0v-17h16.9a1.25,1.25,0,0,0,0-2.5Z"],
  "arrowLeft": ["M37.25,47.5a1.21,1.21,0,0,1-.88-.37l-18-18a1.24,1.24,0,0,1,0-1.76l18-18a1.24,1.24,0,0,1,1.76,1.76L21,28.25,38.13,45.37a1.24,1.24,0,0,1,0,1.76A1.21,1.21,0,0,1,37.25,47.5Z"],
  "arrowRight": ["M19.25,47.5a1.21,1.21,0,0,1-.88-.37,1.24,1.24,0,0,1,0-1.76L35.48,28.25,18.37,11.13a1.24,1.24,0,0,1,1.76-1.76l18,18a1.24,1.24,0,0,1,0,1.76l-18,18A1.21,1.21,0,0,1,19.25,47.5Z"],
  "view": ["M28.25,15.18c-13,0-19.94,10.62-19.94,12.69,0,1.8,6,13.18,19.94,13.18S48.19,29.67,48.19,27.87C48.19,25.73,41.5,15.18,28.25,15.18Zm0,23.37c-11.43,0-16.76-8.83-17.4-10.64a19.63,19.63,0,0,1,17.4-10.23c11.53,0,17,8.84,17.43,10.2C45.27,29.34,40.2,38.55,28.25,38.55Z", "M28.25,20.57a7.55,7.55,0,1,0,7.55,7.55A7.56,7.56,0,0,0,28.25,20.57Zm0,12.59a5,5,0,1,1,5-5A5.05,5.05,0,0,1,28.25,33.16Z"],
  "share": ["M11,41.16a1.87,1.87,0,0,1-1.1-.35,1.89,1.89,0,0,1-.66-2.26c.14-.35,3.49-8.64,8.53-13.69a24.23,24.23,0,0,1,5.92-4.28l-3.35-4.65a1.9,1.9,0,0,1,1.92-3L46,17.89a1.9,1.9,0,0,1,1.41,1.26h0A1.89,1.89,0,0,1,47,21L30.88,39.06a1.94,1.94,0,0,1-2.09.51,1.9,1.9,0,0,1-1.23-1.75l-.07-5.41a38,38,0,0,0-4.92,1.44c-4.33,1.67-10.26,6.79-10.32,6.84A1.89,1.89,0,0,1,11,41.16Zm.56-1.68ZM23.28,15.72l3.31,4.61a1.27,1.27,0,0,1,.2,1.05,1.3,1.3,0,0,1-.7.82,22.33,22.33,0,0,0-6.54,4.43,40.54,40.54,0,0,0-7,10.56,41,41,0,0,1,9.09-5.67,43,43,0,0,1,6.81-1.87,1.27,1.27,0,0,1,1,.25,1.32,1.32,0,0,1,.46,1L30,36.24,44.43,20.13Zm22.17,4.62Z"],
  "favorite": ["M28.25,46.9a1.23,1.23,0,0,1-.75-.25A84.63,84.63,0,0,1,16.4,36.41c-7.11-8-9.15-14.45-6-19.19,1.74-2.66,3.93-4.07,6.51-4.19,4.76-.23,9.42,4.14,11.39,6.27,2-2.13,6.58-6.51,11.39-6.27,2.59.12,4.77,1.53,6.51,4.19h0c3.1,4.74,1.06,11.2-6,19.19A84.63,84.63,0,0,1,29,46.65,1.23,1.23,0,0,1,28.25,46.9Zm-11-31.38H17c-1.77.08-3.25,1.08-4.54,3-4.72,7.24,9.17,20.33,15.81,25.5,6.64-5.17,20.53-18.26,15.81-25.5h0c-1.29-2-2.77-3-4.53-3-4.89-.25-10.25,6.38-10.3,6.45a1.25,1.25,0,0,1-1,.47h0a1.25,1.25,0,0,1-1-.47C27.22,21.92,22,15.52,17.23,15.52Z"],
  "search": ["M46.13,44.29,35,33.25A15.46,15.46,0,1,0,33.25,35l11.12,11a1.23,1.23,0,0,0,1.76,0A1.25,1.25,0,0,0,46.13,44.29Zm-35.78-21A12.93,12.93,0,1,1,23.28,36.2,12.94,12.94,0,0,1,10.35,23.28Z"],
  "duplicate": ["M34.6,16.87H11.9a1.25,1.25,0,0,0-1.25,1.25V46a1.25,1.25,0,0,0,1.25,1.25H34.6A1.25,1.25,0,0,0,35.85,46V18.12A1.25,1.25,0,0,0,34.6,16.87ZM33.35,44.78H13.15V19.37h20.2Z", "M44.6,9.22H21.9a1.25,1.25,0,0,0-1.25,1.25v3.41a1.25,1.25,0,1,0,2.5,0V11.72h20.2V37.13H39.27a1.25,1.25,0,0,0,0,2.5H44.6a1.25,1.25,0,0,0,1.25-1.25V10.47A1.25,1.25,0,0,0,44.6,9.22Z", "M17,26.56H29.14a1.25,1.25,0,0,0,0-2.5H17a1.25,1.25,0,1,0,0,2.5Z", "M17,33.33H29.14a1.25,1.25,0,0,0,0-2.5H17a1.25,1.25,0,1,0,0,2.5Z", "M17,40.09h8.09a1.25,1.25,0,1,0,0-2.5H17a1.25,1.25,0,1,0,0,2.5Z"],
  "apps": ["M45.6,23.4h-6.1c-1.1,0-2,0.9-2,2v6.1c0,1.1,0.9,2,2,2h6.1c1.1,0,2-0.9,2-2v-6.1C47.6,24.3,46.7,23.4,45.6,23.4z", "M17.5,9.4h-6.1c-1.1,0-2,0.9-2,2v6.1c0,1.1,0.9,2,2,2h6.1c1.1,0,2-0.9,2-2v-6.1C19.5,10.3,18.6,9.4,17.5,9.4z", "M31.5,9.4h-6.1c-1.1,0-2,0.9-2,2v6.1c0,1.1,0.9,2,2,2h6.1c1.1,0,2-0.9,2-2v-6.1C33.5,10.3,32.7,9.4,31.5,9.4z", "M45.6,9.4h-6.1c-1.1,0-2,0.9-2,2v6.1c0,1.1,0.9,2,2,2h6.1c1.1,0,2-0.9,2-2v-6.1C47.6,10.3,46.7,9.4,45.6,9.4z", "M17.5,23.4h-6.1c-1.1,0-2,0.9-2,2v6.1c0,1.1,0.9,2,2,2h6.1c1.1,0,2-0.9,2-2v-6.1C19.5,24.3,18.6,23.4,17.5,23.4z", "M31.5,23.4h-6.1c-1.1,0-2,0.9-2,2v6.1c0,1.1,0.9,2,2,2h6.1c1.1,0,2-0.9,2-2v-6.1C33.5,24.3,32.7,23.4,31.5,23.4z", "M17.5,37.5h-6.1c-1.1,0-2,0.9-2,2v6.1c0,1.1,0.9,2,2,2h6.1c1.1,0,2-0.9,2-2v-6.1C19.5,38.4,18.6,37.5,17.5,37.5z", "M31.5,37.5h-6.1c-1.1,0-2,0.9-2,2v6.1c0,1.1,0.9,2,2,2h6.1c1.1,0,2-0.9,2-2v-6.1C33.5,38.4,32.7,37.5,31.5,37.5z", "M45.6,37.5h-6.1c-1.1,0-2,0.9-2,2v6.1c0,1.1,0.9,2,2,2h6.1c1.1,0,2-0.9,2-2v-6.1C47.6,38.4,46.7,37.5,45.6,37.5z"],
  "check": ["M22.1,38.7C22.1,38.7,22.1,38.7,22.1,38.7c-0.4,0-0.7-0.2-0.9-0.4l-10-11.3c-0.5-0.5-0.4-1.3,0.1-1.8c0.5-0.5,1.3-0.4,1.8,0.1l9.1,10.3l21.2-21.2c0.5-0.5,1.3-0.5,1.8,0s0.5,1.3,0,1.8L23,38.4C22.8,38.6,22.5,38.7,22.1,38.7z"],
  "close": ["M30.3,28.5l12.3-12.3c0.5-0.5,0.5-1.3,0-1.8s-1.3-0.5-1.8,0L28.5,26.7L16.2,14.4c-0.5-0.5-1.3-0.5-1.8,0s-0.5,1.3,0,1.8l12.3,12.3L14.5,40.8c-0.5,0.5-0.5,1.3,0,1.8c0.2,0.2,0.6,0.4,0.9,0.4s0.6-0.1,0.9-0.4l12.3-12.3l12.3,12.3c0.2,0.2,0.6,0.4,0.9,0.4s0.6-0.1,0.9-0.4c0.5-0.5,0.5-1.3,0-1.8L30.3,28.5z"],
  "warn": ["M2.5,27c1.1,0,2-0.9,2-2V2c0-1.1-0.9-2-2-2s-2,0.9-2,2v23C0.5,26.1,1.4,27,2.5,27z", "M0,34.6a2.5,2.5 0 1,0 5,0a2.5,2.5 0 1,0 -5,0"],
  "hamburger": ["M50,10.5 C50,11.32842 49.1865188,12 48.1830582,12 C34.061023,12 19.9389758,12 5.81694063,12 C4.81347272,12 4,11.32842 4,10.5 C4,9.67157 4.81347272,9 5.81694063,9 C19.9389758,9 34.061023,9 48.1830582,9 C49.1865188,9 50,9.67157 50,10.5 Z M50,27.5 C50,28.3284217 49.1865188,29 48.1830582,29 C34.061023,28.99999 19.9389758,28.99999 5.81694063,29 C4.81347272,29 4,28.3284217 4,27.5 C4,26.6715758 4.81347272,26.0000075 5.81694063,26.0000075 C19.9389758,25.9999975 34.061023,25.9999975 48.1830582,26.0000075 C49.1865188,26.0000075 50,26.6715758 50,27.5 Z M50,44.5 C50,45.3284229 49.1865188,45.999992 48.1830582,46 C34.061023,46 19.9389758,46 5.81694063,46 C4.81347272,46 4,45.3284229 4,44.5 C4,43.6715691 4.81347272,43 5.81694063,43 C19.9389758,43 34.061023,43 48.1830582,43 C49.1865188,43 50,43.6715691 50,44.5 Z"],
  "github": ["M24.4371588,4.15939992 C13.843549,5.31087925 5.32260195,13.8318263 4.17112262,24.1951403 C2.78934743,35.7099336 9.92851928,45.6126558 20.0615374,48.836798 L20.0615374,43.539993 C20.0615374,43.539993 19.1403539,43.7702889 17.9888746,43.7702889 C14.7647325,43.7702889 13.3829573,41.0067385 13.1526614,39.3946675 C12.9223655,38.473484 12.4617738,37.7825964 11.7708862,37.0917088 C11.0799986,36.8614129 10.8497027,36.8614129 10.8497027,36.6311171 C10.8497027,36.1705253 11.5405903,36.1705253 11.7708862,36.1705253 C13.1526614,36.1705253 14.3041407,37.7825964 14.7647325,38.473484 C15.9162118,40.3158509 17.297987,40.7764427 17.9888746,40.7764427 C18.9100581,40.7764427 19.6009457,40.5461468 20.0615374,40.3158509 C20.2918333,38.7037799 20.9827209,37.0917088 22.3644961,36.1705253 C17.0676911,35.019046 13.1526614,32.0251997 13.1526614,26.9586907 C13.1526614,24.4254361 14.3041407,21.8921816 15.9162118,20.0498147 C15.6859159,19.589223 15.4556201,18.4377436 15.4556201,16.8256726 C15.4556201,15.9044891 15.4556201,14.5227139 16.1465077,13.1409387 C16.1465077,13.1409387 19.3706498,13.1409387 22.5947919,16.134785 C23.7462713,15.6741932 25.3583423,15.4438974 26.9704134,15.4438974 C28.5824844,15.4438974 30.1945555,15.6741932 31.5763307,16.134785 C34.570177,13.1409387 38.024615,13.1409387 38.024615,13.1409387 C38.4852067,14.5227139 38.4852067,15.9044891 38.4852067,16.8256726 C38.4852067,18.6680395 38.2549108,19.589223 38.024615,20.0498147 C39.636686,21.8921816 40.7881654,24.1951403 40.7881654,26.9586907 C40.7881654,32.0251997 36.8731356,35.019046 31.5763307,36.1705253 C32.9581059,37.3220047 33.8792894,39.3946675 33.8792894,41.4673302 L33.8792894,49.0670938 C43.3214199,46.0732476 50,37.3220047 50,27.1889865 C50,13.3712346 38.2549108,2.54732886 24.4371588,4.15939992 Z"],
  "gitter": ["M12,4 C11.448,4 11,4.447 11,5 L11,32 C11,32.553 11.448,33 12,33 L16,33 C16.552,33 17,32.553 17,32 L17,5 C17,4.447 16.552,4 16,4 L12,4 Z M21,11 C20.448,11 20,11.447 20,12 L20,49 C20,49.553 20.448,50 21,50 L25,50 C25.552,50 26,49.553 26,49 L26,12 C26,11.447 25.552,11 25,11 L21,11 Z M30,11 C29.448,11 29,11.447 29,12 L29,49 C29,49.553 29.448,50 30,50 L34,50 C34.552,50 35,49.553 35,49 L35,12 C35,11.447 34.552,11 34,11 L30,11 Z M39,11 C38.448,11 38,11.447 38,12 L38,32 C38,32.553 38.448,33 39,33 L43,33 C43.552,33 44,32.553 44,32 L44,12 C44,11.447 43.552,11 43,11 L39,11 Z"],
  "twitter": ["M50,12.4239727 C48.3042633,13.1768373 46.4866339,13.6823316 44.5757932,13.9117759 C46.5260699,12.7430435 48.0246276,10.8931487 48.7273008,8.69191778 C46.9060866,9.77102284 44.8805237,10.5561528 42.7330681,10.9791903 C41.0122358,9.14363582 38.5600497,8 35.8461539,8 C30.6334663,8 26.4066716,12.223209 26.4066716,17.4358974 C26.4066716,18.1744209 26.4927132,18.8950192 26.654041,19.5869379 C18.8099135,19.19258 11.8584676,15.4354294 7.2014657,9.7244172 C6.38765517,11.122593 5.9251817,12.7430435 5.9251817,14.4710464 C5.9251817,17.7442128 7.58865298,20.6337776 10.123295,22.3295142 C8.57454583,22.2793228 7.11900892,21.8527005 5.84630976,21.1464415 C5.84630976,21.1858775 5.84630976,21.2253135 5.84630976,21.2647494 C5.84630976,25.8392954 9.10155097,29.6502214 13.4143873,30.521393 C12.6256725,30.7364971 11.790352,30.8512192 10.9299358,30.8512192 C10.3204739,30.8512192 9.728938,30.7938581 9.15174237,30.679136 C10.356325,34.4255312 13.8410105,37.1609379 17.9674225,37.2362241 C14.7408618,39.7672821 10.671811,41.2730104 6.24783731,41.2730104 C5.48421818,41.2730104 4.73493932,41.2299896 4,41.1403631 C8.17301828,43.8219936 13.1347516,45.3814972 18.4657471,45.3814972 C35.8246439,45.3814972 45.3179024,31.0017925 45.3179024,18.5329276 C45.3179024,18.1242304 45.307147,17.7119474 45.2928067,17.3104198 C47.1355309,15.9803596 48.7344714,14.3168883 50,12.4239727 Z"]
}

},{}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/src/node_modules/themeSwitcher.js":[function(require,module,exports){
const bel = require('bel')
const csjs = require('csjs-inject')
const unfocusElement = require('unfocusElement')
module.exports = themeSwitcher

function themeSwitcher (notify) {
  let colors = [
    {
      class: css.cubeDark,
      theme: 'dark',
      id: 'darkTheme',
      active: true
    },
    {
      class: css.cubeWhite,
      theme: 'white',
      id: 'lightTheme',
      active: false
    }
  ]
  var activeColor
  const currentTheme = colors.filter( color => color.active )
                             .map( color => bel`<span class="${css.colorplate} ${color.class}"></span>`)
  let themes = (colors) => bel`${colors.reverse().map( color => {
    var colorEl = bel`
      <span class="${css.colorplate} ${color.class} ${color.active ? css.current : ''}"
      data-theme=${color.theme}
      onclick=${ (e) => select(e, color)}></span>`
    if (color.active) activeColor = colorEl
    return colorEl
  })}`

  let cube = bel`<div class=${css.switch} onclick=${(e) => openTheme(e)}>${currentTheme}</div>`
  let themeSwitch = bel`<div class=${css.themeSwitch}>${themes(colors)}</div>`

  unfocusElement(x => x === actions, (hasFocus) => {
    //@TODO don't trigger when pagination buttons are clicked
    if (hasFocus) return
    if (!themeSwitch.classList.contains(css.open)) return
    themeSwitch.classList.add(css.close)
    themeSwitch.classList.remove(css.open)
  })

  var actions =  bel`
    <div class=${css.actions}>
      ${cube}
      ${themeSwitch}
    </div>
  `
  return actions

  function openTheme(e) {
    if (themeSwitch.classList.contains(css.open)) return
    themeSwitch.classList.add(css.open)
    themeSwitch.classList.remove(css.close)
  }

  function select(e, color) {
    let colorEl = e.target
    let classes = [...colorEl.classList]

    if (colorEl.classList.contains(css.current)) return
    colorEl.classList.add(css.current)
    activeColor.classList.remove(css.current)
    activeColor = colorEl

    cube.firstChild.setAttribute('class', classes.join(' '))

    notify({ type: 'theme', data: color.id })

  }
}

const css = csjs`
.actions {
  position: relative;
}
.switch {
}
.switch .colorplate {
  margin-top: 5px;
}
.themeSwitch {
  position: absolute;
  right: -8px;
  top: 0px;
  z-index: 3;
  display: grid;
  grid-template: 1fr / repeat(2, 1fr);
  grid-gap: 4px;
  padding: 4px 8px 4px 8px;
  border-radius: 30px;
  background-color: var(--themeSwitch-background);
  visibility: hidden;
}
.colorplate {
  display: inline-block;
  width: 20px;
  height: 20px;
  border: 1px solid #888;
  border-radius: 6px;
  cursor: pointer;
}
.colorplate:last-child {
  margin-left: 0;
}
.cubeWhite {
  background-color: #fff;
}
.cubeDark {
  background-color: #1D1D26;
}
.cubeBlue {
  background-color: #33ccff;
}
.cubeYellow {
  background-color: #ffcc00;
}
.current {
  border: 1px solid var(--switch-current-border-color);
}
.open {
  display: grid;
  visibility: visible;
  animation: on .25s ease-in forwards;
}
.close {
  animation: off .25s ease-out forwards
}
@keyframes on {
  0% {
    opacity: 0;
  }
  100% {
    opacity: 1;
  }
}
@keyframes off {
  0% {
    visibility: visible;
    opacity: 1;
  }
  100% {
    visibility: hidden;
    opacity: 0;
  }
}
`

},{"bel":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/bel/browser.js","csjs-inject":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/node_modules/csjs-inject/index.js","unfocusElement":"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/src/node_modules/unfocusElement.js"}],"/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/src/node_modules/unfocusElement.js":[function(require,module,exports){
const html = document.documentElement

module.exports = unfocusElement

function unfocusElement(isTarget, done) {
    window.addEventListener('click', event => {
        var el = event.target
        while(el !== html) {
            if (!isTarget(el)) el = el.parentElement
            else return done(true)
        }
        done(false)
    })
}

},{}]},{},["/home/ninabreznik/Documents/code/ethereum/play/smartcontract.codes/demo/demo.js"]);
