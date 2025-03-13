const EventEmitter = require('events')
const BigNumber = require('bignumber.js')

// buffer the price updates in time buckets
const defaultTimeBucketSize = 10 * 1000

class PriceFeed extends EventEmitter {
  constructor ({ timeBucketSize = defaultTimeBucketSize, initialPrice = null } = {}) {
    super()
    this.price = initialPrice && new BigNumber(initialPrice)
    this.timeBucket = null
    this.timeBucketSize = timeBucketSize
    this.dataPoints = []
    this.timeout = null
  }

  update (price, mts, force = false) {
    price = new BigNumber(price)
    const timeBucket = Math.floor(mts / this.timeBucketSize)

    if (this.price === null || timeBucket > this.timeBucket || force) {
      clearTimeout(this.timeout)

      this.price = price
      this.dataPoints = [price]
      this.timeBucket = timeBucket

      this.emit('update', price)

      const delay = (timeBucket * this.timeBucketSize) + this.timeBucketSize - mts
      this.timeout = setTimeout(this._sendAveragePrice.bind(this), delay)

      return
    }

    if (timeBucket === this.timeBucket) {
      this.dataPoints.push(price)
    }
  }

  _sendAveragePrice () {
    if (this.dataPoints.length === 0) {
      return
    }

    const sum = this.dataPoints.reduce(
      (acc, val) => acc.plus(val),
      new BigNumber(0)
    )
    const averagePrice = sum.dividedBy(this.dataPoints.length)

    this.price = averagePrice
    this.emit('update', averagePrice)
  }

  close () {
    if (this.timeout) {
      clearTimeout(this.timeout)
    }
    this.removeAllListeners()
  }
}

module.exports = PriceFeed
