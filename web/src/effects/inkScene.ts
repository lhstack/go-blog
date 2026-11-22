export type SceneMood = 'day' | 'night'

const TAU = Math.PI * 2

interface Palette {
  sky: [string, string, string]
  glow: string
  moon: string
  ridges: [string, string, string]
  ridgeRim: string
  mist: string
  ink: string
  star: string
}

const PALETTES: Record<SceneMood, Palette> = {
  day: {
    sky: ['#fbf6ea', '#f2e8d6', '#e8dbc3'],
    glow: 'rgba(255, 233, 196, 0.85)',
    moon: 'rgba(255, 244, 222, 0.65)',
    ridges: ['rgba(122, 143, 136, 0.30)', 'rgba(84, 104, 99, 0.38)', 'rgba(48, 64, 62, 0.46)'],
    ridgeRim: 'rgba(255, 252, 245, 0.55)',
    mist: 'rgba(255, 253, 246, 0.62)',
    ink: 'rgba(58, 62, 58, 0.55)',
    star: 'rgba(255, 255, 255, 0)',
  },
  night: {
    sky: ['#050910', '#0a121b', '#111d28'],
    glow: 'rgba(228, 216, 186, 0.5)',
    moon: 'rgba(248, 242, 226, 0.96)',
    ridges: ['rgba(34, 52, 64, 0.8)', 'rgba(24, 38, 48, 0.88)', 'rgba(13, 22, 30, 0.95)'],
    ridgeRim: 'rgba(198, 216, 222, 0.3)',
    mist: 'rgba(138, 166, 178, 0.14)',
    ink: 'rgba(232, 226, 214, 0.5)',
    star: 'rgba(232, 240, 250, 0.85)',
  },
}

interface Ripple {
  x: number
  y: number
  born: number
  strength: number
}

interface Speck {
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  alpha: number
  sway: number
  drift: number
}

interface Droplet {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  radius: number
}

interface Bird {
  x: number
  y: number
  speed: number
  scale: number
  phase: number
}

interface Star {
  x: number
  y: number
  radius: number
  phase: number
}

/**
 * InkScene 是首页背景的“水墨逍遥”画布：
 * 宣纸天色、层叠远山、流动云气、飞鸟与浮尘，并叠加鼠标墨迹拖尾和点击涟漪。
 * 只用 Canvas 2D 绘制，不加载任何图片资源。
 */
export class InkScene {
  private readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D
  private readonly grain: HTMLCanvasElement
  private mood: SceneMood = 'day'
  private width = 0
  private height = 0
  private dpr = 1
  private time = 0
  private raf = 0
  private lastFrame = 0
  private running = false
  private readonly reduced: boolean
  private readonly pointer = { x: 0, y: 0, lerpX: 0, lerpY: 0, seen: false }
  private readonly trail: { x: number; y: number; age: number }[] = []
  private ripples: Ripple[] = []
  private specks: Speck[] = []
  private droplets: Droplet[] = []
  private birds: Bird[] = []
  private stars: Star[] = []
  private readonly seed = [0.4, 1.9, 3.7]

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      throw new Error('当前浏览器不支持 Canvas 2D')
    }
    this.ctx = ctx
    this.grain = this.createGrain()
    this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    this.resize()
    this.seedLife()
  }

  setMood(mood: SceneMood): void {
    this.mood = mood
    if (this.reduced) {
      this.paint()
    }
  }

  start(): void {
    if (this.running) {
      return
    }
    this.running = true
    window.addEventListener('resize', this.onResize)
    window.addEventListener('pointermove', this.onPointerMove, { passive: true })
    window.addEventListener('pointerdown', this.onPointerDown, { passive: true })
    document.addEventListener('visibilitychange', this.onVisibility)
    if (this.reduced) {
      this.paint()
      return
    }
    this.lastFrame = performance.now()
    this.raf = requestAnimationFrame(this.frame)
  }

  stop(): void {
    this.running = false
    cancelAnimationFrame(this.raf)
    window.removeEventListener('resize', this.onResize)
    window.removeEventListener('pointermove', this.onPointerMove)
    window.removeEventListener('pointerdown', this.onPointerDown)
    document.removeEventListener('visibilitychange', this.onVisibility)
  }

  private readonly onResize = () => {
    this.resize()
    if (this.reduced) {
      this.paint()
    }
  }

  private readonly onVisibility = () => {
    if (document.hidden) {
      cancelAnimationFrame(this.raf)
      return
    }
    if (this.running && !this.reduced) {
      this.lastFrame = performance.now()
      this.raf = requestAnimationFrame(this.frame)
    }
  }

  private readonly onPointerMove = (event: PointerEvent) => {
    this.pointer.x = event.clientX
    this.pointer.y = event.clientY
    this.pointer.seen = true
    this.trail.push({ x: event.clientX, y: event.clientY, age: 0 })
    if (this.trail.length > 26) {
      this.trail.shift()
    }
    if (this.reduced) {
      return
    }
    // 光标周围的浮尘被轻轻推开，形成“气息流动”的错觉。
    for (const speck of this.specks) {
      const dx = speck.x - event.clientX
      const dy = speck.y - event.clientY
      const distance = Math.hypot(dx, dy)
      if (distance < 110 && distance > 0.01) {
        const force = (110 - distance) / 110
        speck.vx += (dx / distance) * force * 26
        speck.vy += (dy / distance) * force * 26
      }
    }
  }

  private readonly onPointerDown = (event: PointerEvent) => {
    this.addRipple(event.clientX, event.clientY, 1)
  }

  addRipple(x: number, y: number, strength: number): void {
    this.ripples.push({ x, y, born: this.time, strength })
    if (this.ripples.length > 8) {
      this.ripples.shift()
    }
    for (let index = 0; index < 9; index += 1) {
      const angle = (index / 9) * TAU + Math.random() * 0.4
      const speed = 26 + Math.random() * 70
      this.droplets.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed * 0.6 - 20,
        life: 1,
        radius: 0.8 + Math.random() * 2.2,
      })
    }
    if (this.reduced) {
      this.paint()
    }
  }

  private resize(): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2)
    this.width = window.innerWidth
    this.height = window.innerHeight
    this.canvas.width = Math.floor(this.width * this.dpr)
    this.canvas.height = Math.floor(this.height * this.dpr)
    this.canvas.style.width = `${this.width}px`
    this.canvas.style.height = `${this.height}px`
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    this.specks = []
    this.birds = []
    this.stars = []
    this.seedLife()
  }

  // seedLife 生成浮尘、飞鸟与星点，数量按窗口面积收敛，避免小屏过密。
  private seedLife(): void {
    const area = this.width * this.height
    const speckCount = Math.min(90, Math.round(area / 22000))
    for (let index = 0; index < speckCount; index += 1) {
      this.specks.push({
        x: Math.random() * this.width,
        y: Math.random() * this.height,
        vx: 0,
        vy: -6 - Math.random() * 16,
        radius: 0.6 + Math.random() * 1.9,
        alpha: 0.12 + Math.random() * 0.4,
        sway: Math.random() * TAU,
        drift: 0.2 + Math.random() * 0.7,
      })
    }

    for (let index = 0; index < 3; index += 1) {
      this.birds.push({
        x: Math.random() * this.width,
        y: this.height * (0.16 + Math.random() * 0.22),
        speed: 12 + Math.random() * 16,
        scale: 0.7 + Math.random() * 0.8,
        phase: Math.random() * TAU,
      })
    }

    for (let index = 0; index < 70; index += 1) {
      this.stars.push({
        x: Math.random() * this.width,
        y: Math.random() * this.height * 0.6,
        radius: 0.4 + Math.random() * 1.1,
        phase: Math.random() * TAU,
      })
    }
  }

  // createGrain 预渲染一张噪点纹理，叠加后让画面有宣纸颗粒感。
  private createGrain(): HTMLCanvasElement {
    const tile = document.createElement('canvas')
    tile.width = 160
    tile.height = 160
    const ctx = tile.getContext('2d')
    if (!ctx) {
      return tile
    }
    const image = ctx.createImageData(tile.width, tile.height)
    for (let index = 0; index < image.data.length; index += 4) {
      const value = 120 + Math.random() * 135
      image.data[index] = value
      image.data[index + 1] = value - 6
      image.data[index + 2] = value - 18
      image.data[index + 3] = 18 + Math.random() * 30
    }
    ctx.putImageData(image, 0, 0)
    return tile
  }

  private readonly frame = (now: number) => {
    if (!this.running || document.hidden) {
      return
    }
    const delta = Math.min((now - this.lastFrame) / 1000, 0.05)
    this.lastFrame = now
    this.time += delta
    this.update(delta)
    this.paint()
    this.raf = requestAnimationFrame(this.frame)
  }

  private update(delta: number): void {
    this.pointer.lerpX += (this.pointer.x - this.pointer.lerpX) * Math.min(delta * 3.4, 1)
    this.pointer.lerpY += (this.pointer.y - this.pointer.lerpY) * Math.min(delta * 3.4, 1)

    for (const point of this.trail) {
      point.age += delta
    }
    while (this.trail.length > 0 && this.trail[0].age > 0.94) {
      this.trail.shift()
    }

    this.ripples = this.ripples.filter((ripple) => this.time - ripple.born < 2.6)

    for (const speck of this.specks) {
      speck.sway += delta * 1.4
      speck.vx *= 0.94
      speck.vy += (-4 - speck.vy) * delta * 0.4
      speck.x += (speck.vx + Math.sin(speck.sway) * 6 * speck.drift) * delta
      speck.y += speck.vy * delta
      if (speck.y < -20) {
        speck.y = this.height + 12
        speck.x = Math.random() * this.width
      }
      if (speck.x < -20) {
        speck.x = this.width + 10
      } else if (speck.x > this.width + 20) {
        speck.x = -10
      }
    }

    for (const droplet of this.droplets) {
      droplet.life -= delta * 0.85
      droplet.vx *= 0.965
      droplet.vy = droplet.vy * 0.965 + 46 * delta
      droplet.x += droplet.vx * delta
      droplet.y += droplet.vy * delta
    }
    this.droplets = this.droplets.filter((droplet) => droplet.life > 0)

    for (const bird of this.birds) {
      bird.x += bird.speed * delta
      bird.phase += delta * 3.1
      if (bird.x > this.width + 60) {
        bird.x = -60
        bird.y = this.height * (0.14 + Math.random() * 0.24)
      }
    }
  }

  private paint(): void {
    const ctx = this.ctx
    const palette = PALETTES[this.mood]
    const { width, height } = this

    ctx.clearRect(0, 0, width, height)

    const sky = ctx.createLinearGradient(0, 0, width * 0.35, height)
    sky.addColorStop(0, palette.sky[0])
    sky.addColorStop(0.55, palette.sky[1])
    sky.addColorStop(1, palette.sky[2])
    ctx.fillStyle = sky
    ctx.fillRect(0, 0, width, height)

    this.paintMoon(palette)
    this.paintStars(palette)
    this.paintRidges(palette)
    this.paintMist(palette)
    this.paintBirds(palette)
    this.paintSpecks(palette)
    this.paintTrail(palette)
    this.paintRipples(palette)
    this.paintGrain()
  }

  private paintMoon(palette: Palette): void {
    const ctx = this.ctx
    // 月轮刻意落在卷首卡片的内侧安全区（右侧但不靠边、上部但不贴顶），
    // 否则半透明卡片的上、右边界会把月轮切出直边。
    const radius = Math.min(this.width, this.height) * 0.082
    const cx = this.width * 0.72 - this.pointer.lerpX * 0.012
    const cy = Math.max(this.height * 0.26, radius * 2) - this.pointer.lerpY * 0.012
    const night = this.mood === 'night'

    // 辉光用 additive 混合叠在夜空上，向内快速衰减。
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    const halo = ctx.createRadialGradient(cx, cy, radius * 0.8, cx, cy, radius * 4.2)
    halo.addColorStop(0, night ? 'rgba(206, 200, 180, 0.22)' : 'rgba(255, 235, 200, 0.34)')
    halo.addColorStop(0.16, night ? 'rgba(186, 190, 184, 0.1)' : 'rgba(255, 233, 196, 0.16)')
    halo.addColorStop(0.42, night ? 'rgba(150, 168, 186, 0.04)' : 'rgba(255, 233, 196, 0.06)')
    halo.addColorStop(0.74, night ? 'rgba(150, 168, 186, 0.014)' : 'rgba(255, 233, 196, 0.02)')
    halo.addColorStop(1, 'rgba(0, 0, 0, 0)')
    ctx.fillStyle = halo
    ctx.beginPath()
    ctx.arc(cx, cy, radius * 4.2, 0, TAU)
    ctx.fill()
    ctx.restore()

    // 月轮：主体几乎是实心圆，只在最外 10% 做一段柔边，
    // 这样隔着半透明的卷首卡片看也依然是一轮月亮，而不是一团灰雾。
    const disc = ctx.createRadialGradient(
      cx - radius * 0.22,
      cy - radius * 0.24,
      radius * 0.1,
      cx,
      cy,
      radius,
    )
    disc.addColorStop(0, night ? 'rgba(255, 253, 246, 1)' : palette.moon)
    disc.addColorStop(0.5, night ? 'rgba(248, 244, 232, 0.99)' : palette.moon)
    disc.addColorStop(0.88, night ? 'rgba(238, 233, 218, 0.96)' : palette.moon)
    disc.addColorStop(0.97, night ? 'rgba(220, 216, 202, 0.62)' : palette.moon)
    disc.addColorStop(1, night ? 'rgba(206, 202, 188, 0)' : 'rgba(255, 244, 222, 0)')
    ctx.fillStyle = disc
    ctx.beginPath()
    ctx.arc(cx, cy, radius, 0, TAU)
    ctx.fill()
  }

  private paintStars(palette: Palette): void {
    if (this.mood === 'day') {
      return
    }
    const ctx = this.ctx
    ctx.fillStyle = palette.star
    for (const star of this.stars) {
      const twinkle = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(this.time * 0.9 + star.phase))
      ctx.globalAlpha = twinkle * 0.75
      ctx.beginPath()
      ctx.arc(star.x, star.y, star.radius, 0, TAU)
      ctx.fill()
    }
    ctx.globalAlpha = 1
  }

  // ridgeHeight 把几组不同频率的正弦叠加成起伏山脊，参数固定后山形稳定不抖动。
  private ridgeHeight(layer: number, x: number): number {
    const offset = this.seed[layer] + this.time * (0.008 + layer * 0.006)
    const t = x * 0.0022 + offset
    return (
      Math.sin(t) * 0.42 +
      Math.sin(t * 2.17 + 1.7) * 0.2 +
      Math.sin(t * 4.31 + 0.6) * 0.08 +
      Math.sin(t * 0.57 + 2.4) * 0.55
    )
  }

  private paintRidges(palette: Palette): void {
    const ctx = this.ctx
    const { width, height } = this
    const bases = [0.66, 0.76, 0.87]
    const amps = [0.09, 0.12, 0.17]
    const parallax = [0.004, 0.01, 0.02]

    for (let layer = 2; layer >= 0; layer -= 1) {
      const shift = this.pointer.lerpX * parallax[layer]
      const baseY = height * bases[layer]
      const amp = height * amps[layer]

      ctx.beginPath()
      ctx.moveTo(-40, height)
      for (let x = -40; x <= width + 40; x += 8) {
        const y = baseY + this.ridgeHeight(layer, x + shift * 12) * amp
        ctx.lineTo(x, y)
      }
      ctx.lineTo(width + 40, height)
      ctx.closePath()

      // 山体从脊线到山脚做一层渐变，夜里也能看出远近层次而不是一团黑。
      const body = ctx.createLinearGradient(0, baseY - amp, 0, height)
      body.addColorStop(0, palette.ridges[layer])
      body.addColorStop(0.55, palette.ridges[layer])
      body.addColorStop(1, this.mood === 'night' ? 'rgba(4, 8, 12, 0.96)' : palette.ridges[layer])
      ctx.fillStyle = body
      ctx.fill()

      // 山脊上的一层薄光，模拟水墨的边缘留白。
      ctx.beginPath()
      for (let x = -40; x <= width + 40; x += 8) {
        const y = baseY + this.ridgeHeight(layer, x + shift * 12) * amp
        if (x === -40) {
          ctx.moveTo(x, y)
        } else {
          ctx.lineTo(x, y)
        }
      }
      ctx.strokeStyle = palette.ridgeRim
      ctx.globalAlpha = (this.mood === 'night' ? 0.5 : 0.34) - layer * 0.1
      ctx.lineWidth = this.mood === 'night' ? 1.3 : 1.1
      ctx.stroke()
      ctx.globalAlpha = 1
    }
  }

  private paintMist(palette: Palette): void {
    const ctx = this.ctx
    const { width, height } = this
    const bands = [
      { y: 0.68, speed: 0.012, radius: 0.5, alpha: 0.9 },
      { y: 0.79, speed: -0.008, radius: 0.62, alpha: 0.7 },
      { y: 0.55, speed: 0.006, radius: 0.38, alpha: 0.5 },
    ]

    for (const [index, band] of bands.entries()) {
      const span = width * 1.4
      const cx = ((this.time * band.speed * 60 + index * 340) % span) - width * 0.2
      const cy = height * band.y + Math.sin(this.time * 0.12 + index) * 10
      const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, width * band.radius)
      gradient.addColorStop(0, palette.mist)
      gradient.addColorStop(1, 'rgba(0, 0, 0, 0)')
      ctx.globalAlpha = band.alpha
      ctx.fillStyle = gradient
      ctx.beginPath()
      ctx.ellipse(cx, cy, width * band.radius, height * 0.06, 0, 0, TAU)
      ctx.fill()
      ctx.globalAlpha = 1
    }
  }

  private paintBirds(palette: Palette): void {
    const ctx = this.ctx
    ctx.strokeStyle = palette.ink
    ctx.lineWidth = 1.4
    ctx.lineCap = 'round'

    for (const bird of this.birds) {
      const flap = Math.sin(bird.phase) * 5
      const scale = bird.scale
      ctx.globalAlpha = 0.55
      ctx.beginPath()
      ctx.moveTo(bird.x - 11 * scale, bird.y + flap * 0.4)
      ctx.quadraticCurveTo(bird.x - 5 * scale, bird.y - 4 * scale - flap, bird.x, bird.y)
      ctx.quadraticCurveTo(bird.x + 5 * scale, bird.y - 4 * scale - flap, bird.x + 11 * scale, bird.y + flap * 0.4)
      ctx.stroke()
    }
    ctx.globalAlpha = 1
  }

  private paintSpecks(palette: Palette): void {
    const ctx = this.ctx
    ctx.fillStyle = palette.ink
    for (const speck of this.specks) {
      ctx.globalAlpha = speck.alpha
      ctx.beginPath()
      ctx.arc(speck.x, speck.y, speck.radius, 0, TAU)
      ctx.fill()
    }
    ctx.globalAlpha = 1
  }

  private paintTrail(palette: Palette): void {
    if (this.trail.length < 2) {
      return
    }
    const ctx = this.ctx
    ctx.strokeStyle = palette.ink
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    for (let index = 1; index < this.trail.length; index += 1) {
      const from = this.trail[index - 1]
      const to = this.trail[index]
      const freshness = 1 - Math.max(to.age, 0) / 0.94
      ctx.globalAlpha = freshness * 0.24
      ctx.lineWidth = 0.6 + freshness * 3.4
      ctx.beginPath()
      ctx.moveTo(from.x, from.y)
      ctx.lineTo(to.x, to.y)
      ctx.stroke()
    }
    ctx.globalAlpha = 1
  }

  private paintRipples(palette: Palette): void {
    const ctx = this.ctx
    for (const ripple of this.ripples) {
      const progress = (this.time - ripple.born) / 2.6
      if (progress < 0 || progress > 1) {
        continue
      }
      for (let ring = 0; ring < 3; ring += 1) {
        const local = progress - ring * 0.12
        if (local <= 0 || local >= 1) {
          continue
        }
        const radius = 6 + local * (90 + ring * 46) * ripple.strength
        ctx.globalAlpha = (1 - local) * 0.42
        ctx.strokeStyle = palette.ink
        ctx.lineWidth = 1.6 - local
        ctx.beginPath()
        ctx.arc(ripple.x, ripple.y, radius, 0, TAU)
        ctx.stroke()
      }
    }

    for (const droplet of this.droplets) {
      ctx.globalAlpha = Math.max(droplet.life, 0) * 0.7
      ctx.fillStyle = palette.ink
      ctx.beginPath()
      ctx.arc(droplet.x, droplet.y, droplet.radius, 0, TAU)
      ctx.fill()
    }
    ctx.globalAlpha = 1
  }

  private paintGrain(): void {
    const ctx = this.ctx
    const pattern = ctx.createPattern(this.grain, 'repeat')
    if (!pattern) {
      return
    }
    // 日间用 multiply 压出纸纹；夜里若继续 multiply 会把夜空压成脏灰，改用 overlay 提亮。
    if (this.mood === 'night') {
      ctx.globalAlpha = 0.08
      ctx.globalCompositeOperation = 'overlay'
    } else {
      ctx.globalAlpha = 0.3
      ctx.globalCompositeOperation = 'multiply'
    }
    ctx.fillStyle = pattern
    ctx.fillRect(0, 0, this.width, this.height)
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
  }
}
