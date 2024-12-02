const EventEmitter = require('events')
const BigNumber = require('bignumber.js')

class PerformanceManager extends EventEmitter {
  /**
   * @param priceFeed
   * @param maxPositionSize
   * @param allocation
   */
  constructor (priceFeed, {
    maxPositionSize,
    allocation
  }) {
    super()
    if (!allocation) {
      throw new Error('Capital Allocation is mandatory')
    }

    this.maxPositionSize = maxPositionSize && new BigNumber(maxPositionSize)
    this.allocation = new BigNumber(allocation)
    this.availableFunds = new BigNumber(allocation)
    this.priceFeed = priceFeed

    this.peak = new BigNumber(allocation)
    this.trough = new BigNumber(allocation)
    this.openOrders = []
    this.se = 0.005 * allocation // 0.5% of input allocation

    priceFeed.on('update', this.selfUpdate.bind(this))
  }

  /*
   * @returns {Error|null}
   * @description always null
   */
  canOpenOrder() {
    return null
  }

  /**
   * @returns {BigNumber}
   */
  positionSize () {
    return this.openOrders.reduce((size, order) =>
      size.plus(order.amount),
    new BigNumber(0)
    )
  }

  /**
   * @returns {BigNumber}
   */
  currentAllocation (leverage) {
    return this.openOrders.reduce((alloc, order) => {
      const orderCost = leverage
        ? order.amount.multipliedBy(order.price).dividedBy(leverage)
        : order.amount.multipliedBy(order.price)
      return alloc.plus(orderCost)
    },
    new BigNumber(0)
    )
  }

  addOrder(amount, price) {
    amount = new BigNumber(amount)
    price = new BigNumber(price)

    const total = amount.multipliedBy(price)

    if (amount.isPositive()) {
      if (+total.toFixed(16) - +this.availableFunds.toFixed(16) > this.se) {
        throw new Error(
          `Invalid long amount. Trying to buy ${total
            .abs()
            .toString()} of ${this.availableFunds.toString()}`
        );
      }
      this.availableFunds = this.availableFunds.minus(total)
      this.openOrders.push({ amount, price })
      this.selfUpdate()
      return
    }

    if (+amount.abs().toFixed(16) - +this.positionSize().toFixed(16) > this.se) {
      throw new Error(
        `Invalid short amount. Trying to sell ${amount
          .abs()
          .toString()} of ${this.positionSize().toString()}`
      );
    }

    this.availableFunds = this.availableFunds.plus(total.abs())

    while (!amount.isZero() && this.openOrders.length > 0) {
      const order = this.openOrders.shift()

      if (order.amount.isLessThanOrEqualTo(amount.abs())) {
        amount = amount.plus(order.amount)
      } else {
        order.amount = order.amount.plus(amount)
        this.openOrders.unshift(order)
        break
      }
    }

    this.selfUpdate()
  }

  /**
   * @returns {BigNumber}
   */
  equityCurve () {
    if (!this.priceFeed.price) {
      return this.availableFunds
    }
    return this.priceFeed.price.multipliedBy(this.positionSize()).plus(this.availableFunds)
  }

  /**
   * @returns {BigNumber}
   */
  return () {
    return this.equityCurve().minus(this.allocation)
  }

  /**
   * @returns {BigNumber}
   */
  returnPerc () {
    return this.return().dividedBy(this.allocation)
  }

  /**
   * @returns {BigNumber}
   */
  drawdown () {
    const equityCurve = this.equityCurve()
    if (equityCurve.isGreaterThanOrEqualTo(this.peak) || this.peak.isZero()) {
      return new BigNumber(0)
    }
    return this.peak.minus(equityCurve).dividedBy(this.peak)
  }

  /**
   * @private
   */
  selfUpdate () {
    this.updatePeak()
    this.updateTrough()
    this.emit('update')
  }

  /**
   * @private
   */
  updatePeak () {
    const equityCurve = this.equityCurve()
    if (equityCurve.isGreaterThan(this.peak)) {
      this.peak = equityCurve
    }
  }

  /**
   * @private
   */
  updateTrough () {
    const equityCurve = this.equityCurve()
    if (equityCurve.isLessThan(this.trough) || this.trough.isZero()) {
      this.trough = equityCurve
    }
  }

  close () {
    this.removeAllListeners()
  }
}

module.exports = PerformanceManager
