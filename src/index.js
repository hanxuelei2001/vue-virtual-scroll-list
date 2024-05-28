/**
 * virtual list default component
 */

import Vue from 'vue'
import Virtual from './virtual'
import {Item, Slot} from './item'
import {VirtualProps} from './props'

const EVENT_TYPE = {
    ITEM: 'item_resize',
    SLOT: 'slot_resize'
}
const SLOT_TYPE = {
    HEADER: 'thead', // string value also use for aria role attribute
    FOOTER: 'tfoot'
}

const VirtualList = Vue.component('virtual-list', {
    props: VirtualProps,

    data() {
        return {
            range: null
        }
    },

    watch: {
        // 当元数据的长度发生改变的时候去更新 virtual 的参数
        'dataSources.length'() {
            // 更新 uniqueIds
            this.virtual.updateParam('uniqueIds', this.getUniqueIdFromDataSources())
            // 更新数据源
            this.virtual.handleDataSourcesChange()
        },

        keeps(newValue) {
            // 更新 keeps
            this.virtual.updateParam('keeps', newValue)
            // 最终调用更新数据的方法
            this.virtual.handleSlotSizeChange()
        },

        start(newValue) {
            // 滚动到指定的位置
            this.scrollToIndex(newValue)
        },

        offset(newValue) {
            // 滚动到指定的位置
            this.scrollToOffset(newValue)
        }
    },

    created() {
        // 判断当前的方向是不是水平方向
        this.isHorizontal = this.direction === 'horizontal'
        // 根据方向设置滚动属性键名
        this.directionKey = this.isHorizontal ? 'scrollLeft' : 'scrollTop'

        // 安装虚拟滚动
        this.installVirtual()

        // 监听项目尺寸变化
        this.$on(EVENT_TYPE.ITEM, this.onItemResized)

        // 监听插槽尺寸变化
        if (this.$slots.header || this.$slots.footer) {
            this.$on(EVENT_TYPE.SLOT, this.onSlotResized)
        }
    },

    activated() {
        // set back offset when awake from keep-alive
        // 激活的时候滚动到指定的位置
        this.scrollToOffset(this.virtual.offset)

        // 如果 pageMode 不为空
        // 默认是 false
        if (this.pageMode) {
            document.addEventListener('scroll', this.onScroll, {
                passive: false
            })
        }
    },

    deactivated() {
        // 当组件失活的时候
        if (this.pageMode) {
            document.removeEventListener('scroll', this.onScroll)
        }
    },

    mounted() {
        // set position
        // 如果 start 存在
        if (this.start) {
            // 滚动到指定的位置
            this.scrollToIndex(this.start)
        } else if (this.offset) {
            // 滚动到指定的位置
            this.scrollToOffset(this.offset)
        }

        // in page mode we bind scroll event to document
        // 如果 pageMode 不为空
        if (this.pageMode) {
            this.updatePageModeFront()

            document.addEventListener('scroll', this.onScroll, {
                passive: false
            })
        }
    },

    beforeDestroy() {
        this.virtual.destroy()
        if (this.pageMode) {
            document.removeEventListener('scroll', this.onScroll)
        }
    },

    methods: {
        // get item size by id
        getSize(id) {
            return this.virtual.sizes.get(id)
        },

        // get the total number of stored (rendered) items
        getSizes() {
            return this.virtual.sizes.size
        },

        // return current scroll offset
        getOffset() {
            // 如果 pageMode 为 true
            if (this.pageMode) {
                // 获取滚动的位置
                return document.documentElement[this.directionKey] || document.body[this.directionKey]
            } else {
                // 获取 $refs 所指向的 shepherd
                const {root} = this.$refs
                // 如果存在
                // 从 root 中获取当前 index 在的位置
                return root ? Math.ceil(root[this.directionKey]) : 0
            }
        },

        // return client viewport size
        getClientSize() {
            // 如果是水平方向，那么就获取 clientWidth，否则就获取 clientHeight
            const key = this.isHorizontal ? 'clientWidth' : 'clientHeight'
            // 如果 pageMode 为 true
            if (this.pageMode) {
                // 获取 document.documentElement[key] 或者 document.body[key]
                return document.documentElement[key] || document.body[key]
            } else {
                // 获取 $refs 所指向的 shepherd
                const {root} = this.$refs
                // 如果存在
                // 获取水平或者垂直方向的 clientSize
                return root ? Math.ceil(root[key]) : 0
            }
        },

        // return all scroll size
        getScrollSize() {
            // 如果是水平方向，那么就获取 scrollWidth，否则就获取 scrollHeight
            const key = this.isHorizontal ? 'scrollWidth' : 'scrollHeight'
            // 如果 pageMode 为 true
            if (this.pageMode) {
                // 获取 document.documentElement[key] 或者 document.body[key]
                return document.documentElement[key] || document.body[key]
            } else {
                // 获取 $refs 所指向的 shepherd
                const {root} = this.$refs
                // 如果存在
                // 获取水平或者垂直方向的 scrollSize
                return root ? Math.ceil(root[key]) : 0
            }
        },

        // set current scroll position to a expectant offset
        scrollToOffset(offset) {
            if (this.pageMode) {
                document.body[this.directionKey] = offset
                document.documentElement[this.directionKey] = offset
            } else {
                const {root} = this.$refs
                if (root) {
                    root[this.directionKey] = offset
                }
            }
        },

        // set current scroll position to a expectant index
        scrollToIndex(index) {
            // scroll to bottom
            // 如果 Index 大于等于数据源的长度，那么就滚动到底部
            if (index >= this.dataSources.length - 1) {
                this.scrollToBottom()
            } else {
                // 获取偏移量
                const offset = this.virtual.getOffset(index)
                // 滚动到指定的位置
                this.scrollToOffset(offset)
            }
        },

        // set current scroll position to bottom
        scrollToBottom() {
            // 获取 $refs 所指向的 shepherd
            const {shepherd} = this.$refs
            // 如果存在
            if (shepherd) {
                // 获取高度
                // 如果是水平方向，那么就获取 offsetLeft，否则就获取 offsetTop
                const offset = shepherd[this.isHorizontal ? 'offsetLeft' : 'offsetTop']
                // 滚动到当前这个元素的顶部位置
                this.scrollToOffset(offset)

                // check if it's really scrolled to the bottom
                // maybe list doesn't render and calculate to last range
                // so we need retry in next event loop until it really at bottom
                // 检查是否真的滚动到底部
                setTimeout(() => {
                    if (this.getOffset() + this.getClientSize() + 1 < this.getScrollSize()) {
                        this.scrollToBottom()
                    }
                }, 3)
            }
        },

        // when using page mode we need update slot header size manually
        // taking root offset relative to the browser as slot header size
        updatePageModeFront() {
            const {root} = this.$refs
            if (root) {
                const rect = root.getBoundingClientRect()
                const {defaultView} = root.ownerDocument
                const offsetFront = this.isHorizontal ? (rect.left + defaultView.pageXOffset) : (rect.top + defaultView.pageYOffset)
                this.virtual.updateParam('slotHeaderSize', offsetFront)
            }
        },

        // reset all state back to initial
        reset() {
            this.virtual.destroy()
            this.scrollToOffset(0)
            this.installVirtual()
        },

        // ----------- public method end -----------

        installVirtual() {
            // 初始化 Virtual
            this.virtual = new Virtual({
                slotHeaderSize: 0,
                slotFooterSize: 0,
                keeps: this.keeps,
                estimateSize: this.estimateSize,
                buffer: Math.round(this.keeps / 3), // recommend for a third of keeps
                uniqueIds: this.getUniqueIdFromDataSources()
            }, this.onRangeChanged)

            // sync initial range
            this.range = this.virtual.getRange()
        },

        getUniqueIdFromDataSources() {
            // 解构 dataSources 和 dataKey
            // dataKey 指的是数据源中的唯一键
            const {dataKey} = this
            // 返回 dataSources 的 map 方法，如果 dataKey 是一个函数，那么就调用 dataKey 函数，否则就返回 dataSource[dataKey]
            return this.dataSources.map((dataSource) => typeof dataKey === 'function' ? dataKey(dataSource) : dataSource[dataKey])
        },

        // event called when each item mounted or size changed
        onItemResized(id, size) {
            this.virtual.saveSize(id, size)
            this.$emit('resized', id, size)
        },

        // event called when slot mounted or size changed
        onSlotResized(type, size, hasInit) {
            if (type === SLOT_TYPE.HEADER) {
                this.virtual.updateParam('slotHeaderSize', size)
            } else if (type === SLOT_TYPE.FOOTER) {
                this.virtual.updateParam('slotFooterSize', size)
            }

            if (hasInit) {
                this.virtual.handleSlotSizeChange()
            }
        },

        // here is the rerendering entry
        onRangeChanged(range) {
            this.range = range
        },

        onScroll(evt) {
            // 当元素发生滚动的时候，获取 offset
            // 元素的 offset 是指元素的顶部到视口的距离
            const offset = this.getOffset()
            // 获取 clientSize
            // clientSize 是指元素的可视区域的大小
            const clientSize = this.getClientSize()
            // 获取 scrollSize
            // scrollSize 是指元素的滚动区域的大小
            const scrollSize = this.getScrollSize()

            // iOS scroll-spring-back behavior will make direction mistake
            // 如果 offset 小于 0 或者 offset + clientSize 大于 scrollSize + 1 或者 scrollSize 不存在
            // 元素的 offset 是指元素的顶部到视口的距离为 0 或者 元素的 offset + 元素的可视区域的大小大于元素的滚动区域的大小 + 1 或者 元素的滚动区域的大小不存在
            if (offset < 0 || (offset + clientSize > scrollSize + 1) || !scrollSize) {
                return
            }

            // 滚动的距离不够，则滚动到指定位置
            this.virtual.handleScroll(offset)
            this.emitEvent(offset, clientSize, scrollSize, evt)
        },

        // emit event in special position
        emitEvent(offset, clientSize, scrollSize, evt) {
            this.$emit('scroll', evt, this.virtual.getRange())

            if (this.virtual.isFront() && !!this.dataSources.length && (offset - this.topThreshold <= 0)) {
                this.$emit('totop')
            } else if (this.virtual.isBehind() && (offset + clientSize + this.bottomThreshold >= scrollSize)) {
                this.$emit('tobottom')
            }
        },

        // get the real render slots based on range data
        // in-place patch strategy will try to reuse components as possible
        // so those components that are reused will not trigger lifecycle mounted
        getRenderSlots(h) {
            const slots = []
            // 解构 range
            const {start, end} = this.range
            const {
                dataSources,
                dataKey,
                itemClass,
                itemTag,
                itemStyle,
                isHorizontal,
                extraProps,
                dataComponent,
                itemScopedSlots
            } = this
            const slotComponent = this.$scopedSlots && this.$scopedSlots.item
            for (let index = start; index <= end; index++) {
                const dataSource = dataSources[index]
                if (dataSource) {
                    const uniqueKey = typeof dataKey === 'function' ? dataKey(dataSource) : dataSource[dataKey]
                    if (typeof uniqueKey === 'string' || typeof uniqueKey === 'number') {
                        slots.push(h(Item, {
                            props: {
                                index,
                                tag: itemTag,
                                event: EVENT_TYPE.ITEM,
                                horizontal: isHorizontal,
                                uniqueKey: uniqueKey,
                                source: dataSource,
                                extraProps: extraProps,
                                component: dataComponent,
                                slotComponent: slotComponent,
                                scopedSlots: itemScopedSlots
                            },
                            style: itemStyle,
                            class: `${itemClass}${this.itemClassAdd ? ' ' + this.itemClassAdd(index) : ''}`
                        }))
                    } else {
                        console.warn(`Cannot get the data-key '${dataKey}' from data-sources.`)
                    }
                } else {
                    console.warn(`Cannot get the index '${index}' from data-sources.`)
                }
            }
            return slots
        }
    },

    // render function, a closer-to-the-compiler alternative to templates
    // https://vuejs.org/v2/guide/render-function.html#The-Data-Object-In-Depth
    // 当元素渲染的时候
    render(h) {
        // 从 solts 中获取 header 和 footer
        const {header, footer} = this.$slots
        // 获取 range，这里面包含了从哪些元素开始，到哪些元素结束
        const {padFront, padBehind} = this.range
        // 获取元素信息
        const {
            isHorizontal,
            pageMode,
            rootTag,
            wrapTag,
            wrapClass,
            wrapStyle,
            headerTag,
            headerClass,
            headerStyle,
            footerTag,
            footerClass,
            footerStyle
        } = this
        // 获取 padding 的样式
        const paddingStyle = {padding: isHorizontal ? `0px ${padBehind}px 0px ${padFront}px` : `${padFront}px 0px ${padBehind}px`}
        // 获取包装器的样式
        const wrapperStyle = wrapStyle ? Object.assign({}, wrapStyle, paddingStyle) : paddingStyle

        return h(rootTag, {
            ref: 'root',
            on: {
                '&scroll': !pageMode && this.onScroll
            }
        }, [
            // header slot
            header ? h(Slot, {
                class: headerClass,
                style: headerStyle,
                props: {
                    tag: headerTag,
                    event: EVENT_TYPE.SLOT,
                    uniqueKey: SLOT_TYPE.HEADER
                }
            }, header) : null,

            // main list
            h(wrapTag, {
                class: wrapClass,
                attrs: {
                    role: 'group'
                },
                style: wrapperStyle
            }, this.getRenderSlots(h)),

            // footer slot
            footer ? h(Slot, {
                class: footerClass,
                style: footerStyle,
                props: {
                    tag: footerTag,
                    event: EVENT_TYPE.SLOT,
                    uniqueKey: SLOT_TYPE.FOOTER
                }
            }, footer) : null,

            // an empty element use to scroll to bottom
            h('div', {
                ref: 'shepherd',
                style: {
                    width: isHorizontal ? '0px' : '100%',
                    height: isHorizontal ? '100%' : '0px'
                }
            })
        ])
    }
})

export default VirtualList
