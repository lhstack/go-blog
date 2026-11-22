import { Reverb } from './reverb'

// 五声音阶（宫商角徵羽）相对基频的比值，听感上接近古琴与箫的空灵味道。
const PENTATONIC_RATIOS = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3]
const BASE_FREQUENCY = 146.83 // D3
const OCTAVES = [1, 2, 4]

/**
 * Ambience 是纯 Web Audio 生成的背景音乐：
 * 随机化的五声音阶拨弦 + 低通泛音 + 混响尾音 + 极低音量的风尾噪声。
 * 不依赖任何音频文件，因此不增加部署体积，也不需要额外静态资源。
 */
export class Ambience {
  private context: AudioContext | null = null
  private master: GainNode | null = null
  private reverb: Reverb | null = null
  private windGain: GainNode | null = null
  private timer: number | null = null
  private volume = 0.5
  private running = false

  get playing(): boolean {
    return this.running
  }

  async start(volume: number): Promise<void> {
    this.volume = volume
    if (this.running) {
      this.applyVolume()
      return
    }
    const context = new AudioContext()
    await context.resume()

    const master = context.createGain()
    master.gain.value = 0
    master.connect(context.destination)

    const reverb = new Reverb(context)
    reverb.connect(master)

    const bus = context.createGain()
    bus.gain.value = 0.9
    bus.connect(master)
    bus.connect(reverb.input)

    this.context = context
    this.master = master
    this.reverb = reverb
    this.windGain = this.buildWind(context, bus)
    this.running = true

    this.applyVolume()
    this.schedulePluck(context, bus)
    this.timer = window.setInterval(() => this.schedulePluck(context, bus), 2100)
  }

  stop(): void {
    if (this.timer !== null) {
      window.clearInterval(this.timer)
      this.timer = null
    }
    const context = this.context
    const master = this.master
    const reverb = this.reverb
    const windGain = this.windGain
    this.running = false
    this.context = null
    this.master = null
    this.reverb = null
    this.windGain = null
    if (context && master) {
      // 先淡出再关闭，避免直接掐断产生爆音。
      master.gain.cancelScheduledValues(context.currentTime)
      master.gain.setValueAtTime(master.gain.value, context.currentTime)
      master.gain.linearRampToValueAtTime(0, context.currentTime + 0.6)
      windGain?.disconnect()
      reverb?.disconnect()
      window.setTimeout(() => void context.close(), 700)
    }
  }

  setVolume(volume: number): void {
    this.volume = volume
    this.applyVolume()
  }

  /** suspend 在页面隐去时挂起音频时钟，回来后再 resume，节省电也避免打扰。 */
  suspend(): void {
    if (this.context && this.context.state === 'running') {
      void this.context.suspend()
    }
  }

  async resume(): Promise<void> {
    if (this.context && this.context.state === 'suspended') {
      await this.context.resume()
    }
  }

  private applyVolume(): void {
    if (!this.context || !this.master) {
      return
    }
    const now = this.context.currentTime
    this.master.gain.cancelScheduledValues(now)
    this.master.gain.setValueAtTime(this.master.gain.value, now)
    this.master.gain.linearRampToValueAtTime(this.volume, now + 1.2)
  }

  // buildWind 生成一段循环噪声，用低通与缓慢的 LFO 模拟远处松风。
  private buildWind(context: AudioContext, destination: AudioNode): GainNode {
    const length = context.sampleRate * 4
    const buffer = context.createBuffer(1, length, context.sampleRate)
    const data = buffer.getChannelData(0)
    let last = 0
    for (let index = 0; index < length; index += 1) {
      // 简单的一阶低通白噪声，避免高频刺耳。
      last = last * 0.96 + (Math.random() * 2 - 1) * 0.04
      data[index] = last * 3.2
    }

    const source = context.createBufferSource()
    source.buffer = buffer
    source.loop = true

    const filter = context.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 420
    filter.Q.value = 0.6

    const gain = context.createGain()
    gain.gain.value = 0.16

    const lfo = context.createOscillator()
    lfo.frequency.value = 0.045
    const lfoGain = context.createGain()
    lfoGain.gain.value = 0.09
    lfo.connect(lfoGain)
    lfoGain.connect(gain.gain)

    source.connect(filter)
    filter.connect(gain)
    gain.connect(destination)

    source.start()
    lfo.start()
    return gain
  }

  // schedulePluck 每轮发出 1~3 个音，音高与间隔都带随机，听起来不会机械重复。
  private schedulePluck(context: AudioContext, destination: AudioNode): void {
    const count = 1 + Math.floor(Math.random() * 3)
    for (let index = 0; index < count; index += 1) {
      const delay = index * (0.28 + Math.random() * 0.5)
      const frequency = this.pickFrequency()
      this.pluck(context, destination, frequency, context.currentTime + 0.05 + delay)
    }
  }

  private pickFrequency(): number {
    const ratio = PENTATONIC_RATIOS[Math.floor(Math.random() * PENTATONIC_RATIOS.length)]
    const octave = OCTAVES[Math.floor(Math.random() * OCTAVES.length)]
    return BASE_FREQUENCY * ratio * octave
  }

  // pluck 用一个快速衰减的三角波加二次泛音，模拟拨弦的起音与尾音。
  private pluck(context: AudioContext, destination: AudioNode, frequency: number, at: number): void {
    const envelope = context.createGain()
    envelope.gain.setValueAtTime(0, at)
    envelope.gain.linearRampToValueAtTime(0.22, at + 0.012)
    envelope.gain.exponentialRampToValueAtTime(0.0008, at + 3.4)

    const filter = context.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(Math.min(frequency * 6, 5200), at)
    filter.frequency.exponentialRampToValueAtTime(Math.max(frequency * 1.6, 320), at + 2.6)
    filter.Q.value = 0.9

    const fundamental = context.createOscillator()
    fundamental.type = 'triangle'
    fundamental.frequency.value = frequency

    const shimmer = context.createOscillator()
    shimmer.type = 'sine'
    shimmer.frequency.value = frequency * 2.004
    const shimmerGain = context.createGain()
    shimmerGain.gain.value = 0.35

    fundamental.connect(filter)
    shimmer.connect(shimmerGain)
    shimmerGain.connect(filter)
    filter.connect(envelope)
    envelope.connect(destination)

    const stopAt = at + 3.6
    fundamental.start(at)
    shimmer.start(at)
    fundamental.stop(stopAt)
    shimmer.stop(stopAt)
  }
}
