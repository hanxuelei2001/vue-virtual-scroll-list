/**
 * virtual list core calculating center
 */

const DIRECTION_TYPE = {
  FRONT: 'FRONT', // scroll up or left
  BEHIND: 'BEHIND' // scroll down or right
}
const CALC_TYPE = {
  INIT: 'INIT',
  FIXED: 'FIXED',
  DYNAMIC: 'DYNAMIC'
}
const LEADING_BUFFER = 0

export default class Virtual {
  constructor (param, callUpdate) {
    this.init(param, callUpdate)
  }

  init (param, callUpdate) {
    // param data
    this.param = param
    this.callUpdate = callUpdate

    // size data
    this.sizes = new Map()
    this.firstRangeTotalSize = 0
    this.firstRangeAverageSize = 0
    this.fixedSizeValue = 0
    this.calcType = CALC_TYPE.INIT

    // scroll data
    this.offset = 0
    this.direction = ''

    // range data
    this.range = Object.create(null)
    if (param) {
      this.checkRange(0, param.keeps - 1)
    }

    // benchmark test data
    // this.__bsearchCalls = 0
    // this.__getIndexOffsetCalls = 0
  }

  destroy () {
    this.init(null, null)
  }

  // return current render range
  getRange () {
    // 返回一个新的对象
    const range = Object.create(null)
    // 设置 range 的 start 和 end
    range.start = this.range.start
    range.end = this.range.end
    range.padFront = this.range.padFront
    range.padBehind = this.range.padBehind
    return range
  }

  isBehind () {
    // 如果当前方向是向下滚动，那么就是向后
    return this.direction === DIRECTION_TYPE.BEHIND
  }

  isFront () {
    // 如果当前方向是向上滚动，那么就是向前
    return this.direction === DIRECTION_TYPE.FRONT
  }

  // return start index offset
  getOffset (start) {
    // 如果 start 小于 1，那么就返回 0，否则就是获取当前 index 的偏移量
    return (start < 1 ? 0 : this.getIndexOffset(start)) + this.param.slotHeaderSize
  }

  updateParam (key, value) {
    // 判断参数是否存在，然后就是 key 是否在 param 中
    // 这里的 key 就是上面传递的 uniqueIds
    if (this.param && (key in this.param)) {
      // if uniqueIds change, find out deleted id and remove from size map
      // 如果 uniqueIds 发生了改变，那么就需要找出被删除的 id 并且从 size map 中移除
      if (key === 'uniqueIds') {
        // 从 size 中找到不在 value 中的 key 并且删除
        this.sizes.forEach((v, key) => {
          if (!value.includes(key)) {
            this.sizes.delete(key)
          }
        })
      }
      // 更新 param 中的 key
      this.param[key] = value
    }
  }

  // save each size map by id
  saveSize (id, size) {
    this.sizes.set(id, size)

    // we assume size type is fixed at the beginning and remember first size value
    // if there is no size value different from this at next comming saving
    // we think it's a fixed size list, otherwise is dynamic size list
    if (this.calcType === CALC_TYPE.INIT) {
      this.fixedSizeValue = size
      this.calcType = CALC_TYPE.FIXED
    } else if (this.calcType === CALC_TYPE.FIXED && this.fixedSizeValue !== size) {
      this.calcType = CALC_TYPE.DYNAMIC
      // it's no use at all
      delete this.fixedSizeValue
    }

    // calculate the average size only in the first range
    if (this.calcType !== CALC_TYPE.FIXED && typeof this.firstRangeTotalSize !== 'undefined') {
      if (this.sizes.size < Math.min(this.param.keeps, this.param.uniqueIds.length)) {
        this.firstRangeTotalSize = [...this.sizes.values()].reduce((acc, val) => acc + val, 0)
        this.firstRangeAverageSize = Math.round(this.firstRangeTotalSize / this.sizes.size)
      } else {
        // it's done using
        delete this.firstRangeTotalSize
      }
    }
  }

  // in some special situation (e.g. length change) we need to update in a row
  // try goiong to render next range by a leading buffer according to current direction
  handleDataSourcesChange () {
    // 获取 range 中的 start
    let start = this.range.start

    // 如果向上滚动，那么就减去一个 LEADING_BUFFER
    if (this.isFront()) {
      start = start - LEADING_BUFFER
    } else if (this.isBehind()) {
      // 如果向下滚动，那么就加上一个 LEADING_BUFFER
      start = start + LEADING_BUFFER
    }

    // 保证 start 大于等于 0
    start = Math.max(start, 0)

    // 重新计算 end
    // start 则是 start + param.keeps - 1
    // end 是 start 和 getLastIndex() 的最小值
    this.updateRange(this.range.start, this.getEndByStart(start))
  }

  // when slot size change, we also need force update
  handleSlotSizeChange () {
    this.handleDataSourcesChange()
  }

  // calculating range on scroll
  handleScroll (offset) {
    this.direction = offset < this.offset || offset === 0 ? DIRECTION_TYPE.FRONT : DIRECTION_TYPE.BEHIND
    this.offset = offset

    if (!this.param) {
      return
    }

    if (this.direction === DIRECTION_TYPE.FRONT) {
      this.handleFront()
    } else if (this.direction === DIRECTION_TYPE.BEHIND) {
      this.handleBehind()
    }
  }

  // ----------- public method end -----------

  handleFront () {
    const overs = this.getScrollOvers()
    // should not change range if start doesn't exceed overs
    if (overs > this.range.start) {
      return
    }

    // move up start by a buffer length, and make sure its safety
    const start = Math.max(overs - this.param.buffer, 0)
    this.checkRange(start, this.getEndByStart(start))
  }

  handleBehind () {
    const overs = this.getScrollOvers()
    // range should not change if scroll overs within buffer
    if (overs < this.range.start + this.param.buffer) {
      return
    }

    this.checkRange(overs, this.getEndByStart(overs))
  }

  // return the pass overs according to current scroll offset
  getScrollOvers () {
    // if slot header exist, we need subtract its size
    const offset = this.offset - this.param.slotHeaderSize
    if (offset <= 0) {
      return 0
    }

    // if is fixed type, that can be easily
    if (this.isFixedType()) {
      return Math.floor(offset / this.fixedSizeValue)
    }

    let low = 0
    let middle = 0
    let middleOffset = 0
    let high = this.param.uniqueIds.length

    while (low <= high) {
      // this.__bsearchCalls++
      middle = low + Math.floor((high - low) / 2)
      middleOffset = this.getIndexOffset(middle)

      if (middleOffset === offset) {
        return middle
      } else if (middleOffset < offset) {
        low = middle + 1
      } else if (middleOffset > offset) {
        high = middle - 1
      }
    }

    return low > 0 ? --low : 0
  }

  // return a scroll offset from given index, can efficiency be improved more here?
  // although the call frequency is very high, its only a superposition of numbers
  getIndexOffset (givenIndex) {
    // 如果给定的偏移量不存在，那么就返回 0
    if (!givenIndex) {
      return 0
    }

    // 定义一个偏移量
    let offset = 0
    let indexSize = 0
    // 遍历给定的 index
    for (let index = 0; index < givenIndex; index++) {
      // this.__getIndexOffsetCalls++
      // 获取到当前 index 的大小
      indexSize = this.sizes.get(this.param.uniqueIds[index])
        // 如果 indexSize 存在，那么就加上 indexSize
      offset = offset + (typeof indexSize === 'number' ? indexSize : this.getEstimateSize())
    }

    // 返回偏移量
    return offset
  }

  // is fixed size type
  isFixedType () {
    return this.calcType === CALC_TYPE.FIXED
  }

  // return the real last index
  getLastIndex () {
    // 获取所有的数据长度 - 1
    return this.param.uniqueIds.length - 1
  }

  // in some conditions range is broke, we need correct it
  // and then decide whether need update to next range
  checkRange (start, end) {
    const keeps = this.param.keeps
    const total = this.param.uniqueIds.length

    // datas less than keeps, render all
    if (total <= keeps) {
      start = 0
      end = this.getLastIndex()
    } else if (end - start < keeps - 1) {
      // if range length is less than keeps, corrent it base on end
      start = end - keeps + 1
    }

    if (this.range.start !== start) {
      this.updateRange(start, end)
    }
  }

  // setting to a new range and rerender
  updateRange (start, end) {
    // 设置 range 的 start 和 end
    this.range.start = start
    this.range.end = end
    // 设置 range 的 padFront 和 padBehind
    this.range.padFront = this.getPadFront()
    // 返回当前 range 的 end
    this.range.padBehind = this.getPadBehind()
    // 调用 callUpdate
    this.callUpdate(this.getRange())
  }

  // return end base on start
  getEndByStart (start) {
    // start 的值加上要保留的数据,默认是 30 个,即保留 30 个真实数据
    const theoryEnd = start + this.param.keeps - 1
    // 真正的 end
    // 如果还没有到最后一个元素,那么就选择当前计算出来的 end,否则就是最后一个元素
    const truelyEnd = Math.min(theoryEnd, this.getLastIndex())
    // 返回计算出来的最大的 end
    return truelyEnd
  }

  // return total front offset
  getPadFront () {
    // 如果是固定的大小
    if (this.isFixedType()) {
      // 返回当前 range 的 start 的偏移量
      // 固定的大小 * range 的 start
      return this.fixedSizeValue * this.range.start
    } else {
      // 返回当前 range 的 start 的偏移量
      return this.getIndexOffset(this.range.start)
    }
  }

  // return total behind offset
  getPadBehind () {
    const end = this.range.end
    const lastIndex = this.getLastIndex()

    if (this.isFixedType()) {
      return (lastIndex - end) * this.fixedSizeValue
    }

    return (lastIndex - end) * this.getEstimateSize()
  }

  // get the item estimate size
  getEstimateSize () {
    // 如果是固定的大小，那么就返回固定的大小，否则返回平均的大小
    return this.isFixedType() ? this.fixedSizeValue : (this.firstRangeAverageSize || this.param.estimateSize)
  }
}
