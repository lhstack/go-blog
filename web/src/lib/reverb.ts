/**
 * Reverb 用短反馈延迟网络近似“空谷回声”。
 * 每条支路是 delay → 反馈增益(<1) → delay 的闭环，保证尾音会自然衰减。
 */
export class Reverb {
  readonly input: GainNode
  readonly output: GainNode

  constructor(context: AudioContext, times: number[] = [0.037, 0.053, 0.071, 0.097], feedback = 0.34) {
    this.input = context.createGain()
    this.output = context.createGain()
    this.output.gain.value = 0.55

    const damp = context.createBiquadFilter()
    damp.type = 'lowpass'
    damp.frequency.value = 2200
    this.input.connect(damp)

    for (const [index, time] of times.entries()) {
      const delay = context.createDelay(1)
      delay.delayTime.value = time

      const loop = context.createGain()
      loop.gain.value = feedback - index * 0.05

      const tap = context.createGain()
      tap.gain.value = 0.9 / (index + 1)

      damp.connect(delay)
      delay.connect(loop)
      loop.connect(delay)
      delay.connect(tap)
      tap.connect(this.output)
    }
  }

  connect(destination: AudioNode): void {
    this.output.connect(destination)
  }

  disconnect(): void {
    this.input.disconnect()
    this.output.disconnect()
  }
}
