# smartcontract.codes

[smartcontract.codes](https://smartcontract.codes/) - a search interface for verified solidity source code

![Alt Text](https://media.giphy.com/media/kyLlNLMrOYKrTUYBbU/giphy.gif)

[![Join the chat at https://gitter.im/ethereum/play](https://badges.gitter.im/Join%20Chat.svg)](https://gitter.im/ethereum/play?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)

## Usage

smartcontract.codes is a search engine that allows you to search, browse and interact with solidity source code

### Pull from Github

```
git clone https://github.com/ethereum-play/smartcontract.codes.git
cd smarcontract.codes
```

### Install node modules defined in package.json

```
npm install
```

### Start the app in the browser

```
npm start
```

### To commit changes

```
npm run build
git add -A
git commit -m 'Commit message here'
git push
```

## P2P search engine architecture


Consists of different kind of network nodes:


1. DHT nodes - help with discovery

2. source code nodes - collect source code

3. target list nodes - collect crawler targets

4. crawler & scraper nodes - add new source codes to the network


Find out more about it in [our slides](http://slides.com/serapath/deck-18#/)

## How can I help?

1. Open issues on things that are broken
2. Fix open issues by sending PRs
3. Add documentation

## License

MIT
