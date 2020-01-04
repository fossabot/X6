import { util } from '@antv/x6-util'
import { detector } from '@antv/x6-detector'
import { DomEvent } from '@antv/x6-dom-event'
import { Graph } from '../../graph'
import { MouseHandler } from '../mouse-handler'
import { Rectangle, Point } from '../../struct'
import { MouseEventEx } from '../mouse-event'
import { getRubberbandStyle } from './option'
import { applyClassName, clientToGraph } from '../../util'

export class RubberbandHandler extends MouseHandler {
  /**
   * Optional fade out effect.
   *
   * Default is `false`.
   */
  fadeOut: boolean = false

  protected div: HTMLDivElement | null = null
  protected sharedDiv: HTMLDivElement | null = null

  private onPan: () => void
  private onGesture: () => void
  private onMouseEvent: (arg: { eventName: string; e: MouseEventEx }) => void
  private onMouseMove: null | ((e: MouseEvent) => void)
  private onMouseUp: null | ((e: MouseEvent) => void)

  protected origin: Point | null
  protected currentX: number = 0
  protected currentY: number = 0

  protected x: number
  protected y: number
  protected width: number
  protected height: number

  constructor(graph: Graph) {
    super(graph)
    this.config()

    // Handles force rubberband event
    this.onMouseEvent = ({ eventName, e }) => {
      if (eventName === 'mouseDown' && this.isForceRubberbandEvent(e)) {
        this.prepare(e)
      }
    }

    this.graph.on('mouseEvent', this.onMouseEvent)

    this.onPan = () => this.repaint()
    this.graph.on('pan', this.onPan)

    this.onGesture = () => {
      if (this.origin != null) {
        this.reset()
      }
    }
    this.graph.on('gesture', this.onGesture)
  }

  config() {
    const options = this.graph.options.rubberband
    this.setEnadled(options.enabled)
    this.fadeOut = options.fadeOut
  }

  enable() {
    this.graph.options.rubberband.enabled = true
    super.enable()
  }

  disable() {
    this.graph.options.rubberband.enabled = false
    super.disable()
  }

  /**
   * Returns true if the given event should start rubberband selection.
   */
  protected isForceRubberbandEvent(e: MouseEventEx) {
    return DomEvent.isAltDown(e.getEvent())
  }

  protected getPosition(e: MouseEventEx) {
    const origin = util.getScrollOrigin(this.graph.container)
    const offset = util.getOffset(this.graph.container)

    origin.x -= offset.x
    origin.y -= offset.y

    return {
      x: e.getClientX() + origin.x,
      y: e.getClientY() + origin.y,
    }
  }

  mouseDown(e: MouseEventEx) {
    if (this.isValid(e) && !this.isOnCell(e) && !this.isMultiTouchEvent(e)) {
      this.prepare(e)
    }
  }

  protected prepare(e: MouseEventEx) {
    const { x, y } = this.getPosition(e)
    this.start(x, y)

    // Does not prevent the default for this event so that the
    // event processing chain is still executed even if we start
    // rubberbanding.
    e.consume(false)
  }

  protected start(x: number, y: number) {
    this.origin = new Point(x, y)

    const container = this.graph.container
    const createEvent = (e: MouseEvent) => {
      const me = new MouseEventEx(e)
      const pt = clientToGraph(container, me)
      me.graphX = pt.x
      me.graphY = pt.y
      return me
    }

    this.onMouseMove = (e: MouseEvent) => {
      this.mouseMove(createEvent(e))
    }

    this.onMouseUp = (e: MouseEvent) => {
      this.mouseUp(createEvent(e))
    }

    // Workaround for rubberband stopping if the
    // mouse leaves the container in Firefox
    if (detector.IS_FIREFOX) {
      DomEvent.addMouseListeners(
        document,
        null,
        this.onMouseMove,
        this.onMouseUp,
      )
    }
  }

  mouseMove(e: MouseEventEx) {
    if (!e.isConsumed() && this.origin != null) {
      const { x, y } = this.getPosition(e)
      const dx = this.origin.x - x
      const dy = this.origin.y - y
      const tol = this.graph.tolerance

      if (this.div != null || Math.abs(dx) > tol || Math.abs(dy) > tol) {
        if (this.div == null) {
          this.div = this.createShape()
        }

        // Clears selection while rubberbanding.
        util.clearSelection()

        this.update(x, y)
        e.consume()
      }
    }
  }

  protected createShape() {
    if (this.sharedDiv == null) {
      this.sharedDiv = document.createElement('div')
    }

    this.graph.container.appendChild(this.sharedDiv)
    const result = this.sharedDiv

    // if fade out, then create a new div everytime
    if (this.fadeOut) {
      this.sharedDiv = null
    }

    return result
  }

  protected update(x: number, y: number) {
    this.currentX = x
    this.currentY = y

    this.repaint()
  }

  protected repaint() {
    if (this.div && this.origin) {
      const x = this.currentX - this.graph.panX
      const y = this.currentY - this.graph.panY

      this.x = Math.min(this.origin.x, x)
      this.y = Math.min(this.origin.y, y)
      this.width = Math.max(this.origin.x, x) - this.x
      this.height = Math.max(this.origin.y, y) - this.y

      const style = getRubberbandStyle({
        graph: this.graph,
        x: this.x,
        y: this.y,
        width: this.width,
        height: this.height,
      })

      applyClassName(
        this.div,
        this.graph.prefixCls,
        'rubberband',
        style.className,
      )

      this.div.style.opacity = `${style.opacity || ''}`
      this.div.style.border = style.border
      this.div.style.background = style.background

      this.div.style.position = 'absolute'
      this.div.style.left = util.toPx(this.x)
      this.div.style.top = util.toPx(this.y)
      this.div.style.width = util.toPx(Math.max(1, this.width))
      this.div.style.height = util.toPx(Math.max(1, this.height))
    }
  }

  mouseUp(e: MouseEventEx) {
    const active = this.isActive()
    this.reset()
    if (active) {
      this.execute(e.getEvent())
      e.consume()
    }
  }

  protected isActive() {
    return this.div != null && this.div.style.display !== 'none'
  }

  protected execute(e: MouseEvent) {
    const rect = new Rectangle(this.x, this.y, this.width, this.height)
    this.graph.selectCellsInRegion(rect, e)
  }

  protected reset() {
    if (this.div != null) {
      if (this.fadeOut) {
        const temp = this.div
        util.setPrefixedStyle(temp.style, 'transition', 'all 0.2s linear')
        temp.style.pointerEvents = 'none'
        temp.style.opacity = '0'

        window.setTimeout(() => {
          util.removeElement(temp)
        }, 200)
      } else {
        util.removeElement(this.div)
      }
    }

    DomEvent.removeMouseListeners(
      document,
      null,
      this.onMouseMove,
      this.onMouseUp,
    )

    this.onMouseMove = null
    this.onMouseUp = null

    this.currentX = 0
    this.currentY = 0
    this.origin = null
    this.div = null
  }

  @MouseHandler.dispose()
  dispose() {
    this.graph.removeHandler(this)
    this.graph.off('pan', this.onPan)
    this.graph.off('gesture', this.onGesture)
    this.graph.off('mouseEvent', this.onMouseEvent)

    this.reset()

    if (this.sharedDiv != null) {
      this.sharedDiv = null
    }
  }
}
