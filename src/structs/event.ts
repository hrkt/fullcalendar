import { refineProps } from '../util/misc'
import { parseClassName, ClassNameInput } from '../util/html'
import { DateInput } from '../datelib/env'
import UnzonedRange from '../models/UnzonedRange'
import Calendar from '../Calendar'
import { assignTo } from '../util/object'

/*
*/

export type EventRenderingChoice = '' | 'background' | 'inverse-background' | 'none'

export interface EventNonDateInput {
  id?: string | number
  groupId?: string | number
  title?: string
  url?: string
  editable?: boolean
  startEditable?: boolean
  durationEditable?: boolean
  constraint?: any
  overlap?: any
  rendering?: EventRenderingChoice
  className?: ClassNameInput
  color?: string
  backgroundColor?: string
  borderColor?: string
  textColor?: string
  extendedProps?: object
  [extendedProp: string]: any
}

export interface EventDateInput {
  start?: DateInput
  end?: DateInput
  date?: DateInput
  isAllDay?: boolean
}

export type EventInput = EventNonDateInput & EventDateInput

export interface EventDef {
  defId: string
  sourceId: string
  publicId: string
  groupId: string
  hasEnd: boolean
  isAllDay: boolean
  title: string
  url: string
  editable: boolean | null
  startEditable: boolean | null
  durationEditable: boolean | null
  constraint: any
  overlap: any
  rendering: EventRenderingChoice
  className: string[]
  backgroundColor: string
  borderColor: string
  textColor: string
  extendedProps: object
}

export interface EventInstance {
  instanceId: string
  defId: string
  range: UnzonedRange
  forcedStartTzo: number | null
  forcedEndTzo: number | null
}

export interface EventDateSpan {
  isAllDay: boolean
  hasEnd: boolean
  range: UnzonedRange
  forcedStartTzo: number | null
  forcedEndTzo: number | null
}

export type EventInstanceHash = { [instanceId: string]: EventInstance }
export type EventDefHash = { [defId: string]: EventDef }

const NON_DATE_PROPS = {
  groupId: String,
  title: String,
  url: String,
  editable: Boolean,
  startEditable: Boolean,
  durationEditable: Boolean,
  constraint: null,
  overlap: null,
  rendering: String,
  className: parseClassName,
  color: String,
  backgroundColor: String,
  borderColor: String,
  textColor: String,
  extendedProps: null
}

const DATE_PROPS = {
  start: null,
  date: null,
  end: null,
  isAllDay: null
}

let uid = 0

export function parseEventDef(raw: EventNonDateInput, sourceId: string, isAllDay: boolean, hasEnd: boolean): EventDef {
  let leftovers = {} as any
  let props = refineProps(raw, NON_DATE_PROPS, {}, leftovers) as EventDef

  props.defId = String(uid++)
  props.sourceId = sourceId
  props.isAllDay = isAllDay
  props.hasEnd = hasEnd

  if ('id' in leftovers) {
    props.publicId = String(leftovers.id)
    delete leftovers.id
  }

  if ('color' in leftovers) {
    if (!props.backgroundColor) {
      props.backgroundColor = leftovers.color
    }
    if (!props.borderColor) {
      props.borderColor = leftovers.color
    }
    delete leftovers.color
  }

  props.extendedProps = assignTo(leftovers, props.extendedProps || {})

  return props
}

export function createEventInstance(
  defId: string,
  range: UnzonedRange,
  forcedStartTzo: number | null = null,
  forcedEndTzo: number | null = null
): EventInstance {
  let instanceId = String(uid++)
  return { instanceId, defId, range, forcedStartTzo, forcedEndTzo }
}

export function parseEventDateSpan(
  raw: EventDateInput,
  sourceId: string,
  calendar: Calendar,
  leftovers: object
): EventDateSpan | null {
  let dateProps = refineProps(raw, DATE_PROPS, {}, leftovers)
  let rawStart = dateProps.start
  let startMeta
  let hasEnd = false
  let endMeta = null
  let endMarker = null

  if (rawStart == null) {
    rawStart = dateProps.date
  }

  if (rawStart != null) {
    startMeta = calendar.dateEnv.createMarkerMeta(rawStart)
  }
  if (!startMeta) {
    return null
  }

  if (dateProps.end != null) {
    endMeta = calendar.dateEnv.createMarkerMeta(dateProps.end)
  }

  let isAllDay = dateProps.isAllDay
  if (isAllDay == null && sourceId) {
    let source = calendar.state.eventSources[sourceId]
    isAllDay = source.allDayDefault
  }
  if (isAllDay == null) {
    isAllDay = calendar.opt('allDayDefault')
  }
  if (isAllDay == null) {
    isAllDay = startMeta.isTimeUnspecified && (!endMeta || endMeta.isTimeUnspecified)
  }

  if (endMeta) {
    endMarker = endMeta.marker

    if (endMarker <= startMeta.marker) {
      endMarker = null
    }
  }

  if (endMarker) {
    hasEnd = true
  } else {
    hasEnd = calendar.opt('forceEventDuration') || false

    endMarker = calendar.dateEnv.add(
      startMeta.marker,
      isAllDay ?
        calendar.defaultAllDayEventDuration :
        calendar.defaultTimedEventDuration
    )
  }

  return {
    isAllDay,
    hasEnd,
    range: new UnzonedRange(startMeta.marker, endMarker),
    forcedStartTzo: startMeta.forcedTzo,
    forcedEndTzo: endMeta ? endMeta.forcedTzo : null
  }
}
