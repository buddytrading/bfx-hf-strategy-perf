const AbstractWatcher = require('./AbstractWatcher')

class AbsoluteStopLossWatcher extends AbstractWatcher {
  constructor (performanceManager, stopLoss) {
    super(performanceManager)
    this.stopLoss = stopLoss
  }

  onUpdate () {
    const unrealizedPnl = this.performanceManager.return()

    if (unrealizedPnl.isNegative() && unrealizedPnl.abs().isGreaterThanOrEqualTo(this.stopLoss)) {
      this.abortStrategy(`The Stop loss is greater than Stop-loss level you have configured, please change your strategy logic OR increase your Stop loss Level`)
    }
  }
}

module.exports = AbsoluteStopLossWatcher
