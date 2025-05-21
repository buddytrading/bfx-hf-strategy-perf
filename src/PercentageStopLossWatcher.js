const AbstractWatcher = require('./AbstractWatcher')

class PercentageStopLossWatcher extends AbstractWatcher {
  constructor (performanceManager, stopLoss) {
    super(performanceManager)
    this.stopLoss = stopLoss
  }

  onUpdate () {
    const unrealizedPerc = this.performanceManager.returnPerc()

    if (unrealizedPerc.isNegative() && unrealizedPerc.abs().isGreaterThanOrEqualTo(this.stopLoss)) {
      this.abortStrategy(`The Stop loss is greater than Stop-loss level you have configured, please change your strategy logic OR increase your Stop loss Level`)
    }
  }
}

module.exports = PercentageStopLossWatcher
