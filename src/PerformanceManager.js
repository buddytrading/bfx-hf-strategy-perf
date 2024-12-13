const EventEmitter = require("events");
const BigNumber = require("bignumber.js");

class PerformanceManager extends EventEmitter {
  /**
   * @param priceFeed
   * @param maxPositionSize
   * @param allocation
   * @param leverage
   */
  constructor(priceFeed, { maxPositionSize, allocation, leverage = 1 }) {
    super();
    if (!allocation) {
      throw new Error("Capital Allocation is mandatory");
    }

    this.maxPositionSize = maxPositionSize && new BigNumber(maxPositionSize);
    this.currentAllocations = this.allocation = new BigNumber(
      allocation
    ).multipliedBy(leverage);
    this.initialFunds = this.availableFunds = new BigNumber(allocation);
    this.priceFeed = priceFeed;
    this.leverage = leverage;

    this.se = 0.005 * allocation; // 0.5% of input allocation
    this.peak = new BigNumber(allocation);
    this.trough = new BigNumber(allocation);
    this.openOrders = [];

    priceFeed.on("update", this.selfUpdate.bind(this));
    priceFeed.on("update", this.checkLiquidation.bind(this));
  }

  /*
   * @returns {Error|null}
   * @description always null
   */
  canOpenOrder() {
    return null;
  }

  /**
   * @returns {BigNumber}
   */
  positionSize() {
    return this.openOrders.reduce(
      (size, order) => size.plus(order.amount),
      new BigNumber(0)
    );
  }

  /**
   * @returns {BigNumber}
   */
  currentAllocation() {
    return this.openOrders.reduce((alloc, order) => {
      const orderCost = order.amount.multipliedBy(order.price);
      return alloc.plus(orderCost);
    }, new BigNumber(0));
  }

  addOrder(amount, price) {
    amount = new BigNumber(amount);
    price = new BigNumber(price);

    const total = amount.multipliedBy(price).abs();

    if (amount.isPositive()) {
      if (+total.toFixed(16) - +this.currentAllocations.toFixed(16) > this.se) {
        throw {
          code: "insufficient_fund_error",
          message: `Invalid long amount. Trying to buy ${total
            .abs()
            .toString()} of ${this.availableFunds.toString()}`,
          availableBalance: this.availableFunds.toNumber(),
          requiredBalance: total.abs().toNumber(),
        };
      }
      this.availableFunds = this.availableFunds.minus(
        total.dividedBy(this.leverage)
      );
      this.currentAllocations = this.currentAllocations.minus(total);
      this.openOrders.push({ amount, price });
      this.selfUpdate();
      return;
    }

    if (
      +amount.abs().toFixed(16) - +this.positionSize().toFixed(16) >
      this.se
    ) {
      throw {
        code: "insufficient_fund_error",
        message: `Invalid short amount. Trying to sell ${amount
          .abs()
          .toString()} of ${this.positionSize().toString()}`,
        availableBalance: this.positionSize().toNumber(),
        requiredBalance: amount.abs().toNumber(),
      };
    }

    while (!amount.isZero() && this.openOrders.length > 0) {
      const order = this.openOrders.shift();

      if (order.amount.isLessThanOrEqualTo(amount.abs())) {
        amount = amount.plus(order.amount);
      } else {
        order.amount = order.amount.plus(amount);
        this.openOrders.unshift(order);
        break;
      }
    }

    this.currentAllocations = this.currentAllocations
      .plus(total)
      .plus(this.currentAllocation());
    const allocationPnl = this.currentAllocations.minus(this.allocation);
    this.availableFunds = this.initialFunds.plus(allocationPnl);

    this.selfUpdate();
  }

  /**
   * @returns {BigNumber}
   */
  equityCurve() {
    if (!this.priceFeed.price) {
      return this.availableFunds;
    }
    return this.priceFeed.price
      .multipliedBy(this.positionSize())
      .dividedBy(this.leverage)
      .plus(this.availableFunds);
  }

  /**
   * @returns {BigNumber}
   */
  return() {
    return this.equityCurve().minus(this.allocation.dividedBy(this.leverage));
  }

  /**
   * @returns {BigNumber}
   */
  returnPerc() {
    return this.return().dividedBy(this.allocation.dividedBy(this.leverage));
  }

  /**
   * @returns {BigNumber}
   */
  drawdown() {
    const equityCurve = this.equityCurve();
    if (equityCurve.isGreaterThanOrEqualTo(this.peak) || this.peak.isZero()) {
      return new BigNumber(0);
    }
    return this.peak.minus(equityCurve).dividedBy(this.peak);
  }

  /**
   * @private
   */
  selfUpdate() {
    this.updatePeak();
    this.updateTrough();
    this.emit("update");
  }

  /**
   * @private
   */
  checkLiquidation() {
    if (!this.priceFeed.price) {
      return;
    }
    if (
      this.priceFeed.price
        .multipliedBy(this.positionSize())
        .plus(this.currentAllocations)
        .isLessThan(this.allocation.minus(this.initialFunds))
    ) {
      throw {
        code: "insufficient_fund_error",
        message: "Your account has been liquidated",
      };
    }
    return;
  }

  /**
   * @private
   */
  updatePeak() {
    const equityCurve = this.equityCurve();
    if (equityCurve.isGreaterThan(this.peak)) {
      this.peak = equityCurve;
    }
  }

  /**
   * @private
   */
  updateTrough() {
    const equityCurve = this.equityCurve();
    if (equityCurve.isLessThan(this.trough) || this.trough.isZero()) {
      this.trough = equityCurve;
    }
  }

  close() {
    this.removeAllListeners();
  }
}

module.exports = PerformanceManager;
