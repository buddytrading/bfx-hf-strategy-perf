const AbstractWatcher = require('./AbstractWatcher')

class PercentageStopLossWatcher extends AbstractWatcher {
  constructor (performanceManager, stopLoss) {
    super(performanceManager)
    this.stopLoss = stopLoss
  }

  onUpdate () {
    const unrealizedPerc = this.performanceManager.returnPerc()

    if (unrealizedPerc.isNegative() && unrealizedPerc.abs().isGreaterThanOrEqualTo(this.stopLoss)) {
      this.abortStrategy(`Stop loss percentage triggered: ${unrealizedPerc.toString()} >= ${this.stopLoss.toString()}`)
    }
  }
}

module.exports = PercentageStopLossWatcher
