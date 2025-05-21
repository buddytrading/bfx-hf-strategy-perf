const AbstractWatcher = require('./AbstractWatcher')

class DrawdownWatcher extends AbstractWatcher {
  constructor (performanceManager, maxDrawdown) {
    super(performanceManager)
    this.maxDrawdown = maxDrawdown
  }

  onUpdate () {
    const drawdown = this.performanceManager.drawdown()

    if (drawdown.isGreaterThanOrEqualTo(this.maxDrawdown)) {
      this.abortStrategy(`The drawdown amount is greater than Max-draw down level you have configured, please change your strategy logic OR increase your Max Drawdown Level`)
    }
  }
}

module.exports = DrawdownWatcher
