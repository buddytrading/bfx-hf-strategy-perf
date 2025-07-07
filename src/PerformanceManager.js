const EventEmitter = require('events')
const BigNumber = require('bignumber.js')

class PerformanceManager extends EventEmitter {
  /**
   * @param priceFeed
   * @param maxPositionSize
   * @param allocation
   * @param leverage
   * @param exchangeType
   */
  constructor(priceFeed, { maxPositionSize, allocation, leverage = 1, exchangeType = 'CEX' }) {
    super()
    if (!allocation) {
      throw new Error('Capital Allocation is mandatory')
    }

    this.maxPositionSize = maxPositionSize && new BigNumber(maxPositionSize)
    this.currentAllocations = this.allocation = new BigNumber(
      allocation
    ).multipliedBy(leverage)
    this.initialFunds = this.availableFunds = new BigNumber(allocation)
    this.priceFeed = priceFeed
    this.leverage = leverage

    this.se = new BigNumber(allocation).multipliedBy(0.005) // 0.5% of input allocation
    this.peak = new BigNumber(allocation)
    this.trough = new BigNumber(allocation)
    this.openOrders = []
    this.orderThreshold = exchangeType === 'CEX' ? 10 : 1

    priceFeed.on('update', this.selfUpdate.bind(this))
    priceFeed.on('update', this.checkLiquidation.bind(this))
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
  positionSize() {
    return this.openOrders.reduce(
      (size, order) => size.plus(order.amount),
      new BigNumber(0)
    )
  }

  /**
   * @returns {BigNumber}
   */
  currentAllocation() {
    return this.openOrders.reduce((alloc, order) => {
      const orderCost = order.amount.multipliedBy(order.price)
      return alloc.plus(orderCost)
    }, new BigNumber(0))
  }

  addOrder(amount, price) {
    amount = new BigNumber(amount)
    price = new BigNumber(price)

    const total = amount.multipliedBy(price)

    // if (total.abs().plus(this.se).isLessThan(this.orderThreshold)) {
    //   throw {
    //     code: 'other_error',
    //     message: `Your strategy is making order less than minimum order amount ($${this.orderThreshold}) required by Exchanges, Please double check again!`,
    //   }
    // }

    if (this.openOrders.length === 0) {
      if (total.abs().minus(this.currentAllocations).isGreaterThan(this.se)) {
        throw {
          code: 'insufficient_fund_error',
          message: `Invalid long amount. Trying to buy ${total
            .abs()
            .toString()} of ${this.availableFunds.toString()}`,
          availableBalance: this.availableFunds.toNumber(),
          requiredBalance: total.abs().toNumber(),
        }
      }
      this.availableFunds = this.availableFunds.minus(
        total.dividedBy(this.leverage)
      )
      this.currentAllocations = this.currentAllocations.minus(total)
      this.openOrders.push({ amount, price })
      this.selfUpdate()
      return
    }

    if (total.isGreaterThan(this.currentAllocations)) {
      throw {
        code: 'insufficient_fund_error',
        message: `Insufficient funds. Trying to buy ${total.toFixed(4)} of ${this.currentAllocations.toFixed(4)}`,
        availableBalance: this.currentAllocations.toNumber(),
        requiredBalance: total.toNumber(),
      }
    }


    while ((!amount.isZero() || amount.isGreaterThan(this.se)) && this.openOrders.length > 0) {
      const order = this.openOrders.shift()

      // 1st order side is the same side with incomming order
      // add incomming order into open orders
      // ex: both buy or both sell
      if (amount.multipliedBy(order.amount).isGreaterThan(0)) {
        this.openOrders.unshift(order)
        this.openOrders.push({ amount, price })
        break
      }

      const remainAmount = order.amount.plus(amount)

      // close order
      if (remainAmount.isZero() || remainAmount.multipliedBy(price).abs().isLessThan(this.se)) {
        break
      } else {
        // order amount > incomming order amount
        if (remainAmount.isGreaterThan(0)) {
          order.amount = remainAmount
          this.openOrders.unshift(order)
          break
        }
        // order amount < incomming order amount
        else {
          amount = remainAmount
          // open new order with left over amount
          if (this.openOrders.length === 0) {
            this.openOrders.push({ amount, price })
          }
        }
      }
    }

    this.currentAllocations = this.currentAllocations
      .minus(total)
    const allocationPnl = this.currentAllocations.plus(this.currentAllocation()).minus(this.allocation)
    this.availableFunds = this.initialFunds.plus(allocationPnl)

    this.selfUpdate()
  }

  /**
   * @returns {BigNumber}
   */
  equityCurve() {
    if (!this.priceFeed.price) {
      return this.availableFunds
    }
    return this.priceFeed.price
      .multipliedBy(this.positionSize())
      .dividedBy(this.leverage)
      .plus(this.availableFunds)
  }

  /**
   * @returns {BigNumber}
   */
  return() {
    return this.equityCurve().minus(this.allocation.dividedBy(this.leverage))
  }

  /**
   * @returns {BigNumber}
   */
  returnPerc() {
    return this.return().dividedBy(this.allocation.dividedBy(this.leverage))
  }

  /**
   * @returns {BigNumber}
   */
  drawdown() {
    const equityCurve = this.equityCurve()
    if (equityCurve.isGreaterThanOrEqualTo(this.peak) || this.peak.isZero()) {
      return new BigNumber(0)
    }
    return this.peak.minus(equityCurve).dividedBy(this.peak)
  }

  /**
   * @private
   */
  selfUpdate() {
    this.updatePeak()
    this.updateTrough()
    this.emit('update')
  }

  /**
   * @private
   */
  checkLiquidation() {
    if (!this.priceFeed.price) {
      return
    }
    const marginAmount = this.initialFunds.multipliedBy(this.leverage - 1)
    if (!marginAmount.isZero() && marginAmount.dividedBy(this.positionSize()).isLessThan(this.priceFeed.price)) {
      throw {
        code: 'insufficient_fund_error',
        message: 'Your account has been liquidated',
      }
    }
    return
  }

  /**
   * @private
   */
  updatePeak() {
    const equityCurve = this.equityCurve()
    if (equityCurve.isGreaterThan(this.peak)) {
      this.peak = equityCurve
    }
  }

  /**
   * @private
   */
  updateTrough() {
    const equityCurve = this.equityCurve()
    if (equityCurve.isLessThan(this.trough) || this.trough.isZero()) {
      this.trough = equityCurve
    }
  }

  close() {
    this.removeAllListeners()
  }
}

module.exports = PerformanceManager
