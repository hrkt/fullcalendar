import * as request from 'superagent'
import { registerEventSourceDef, refineProps, addDays, assignTo } from 'fullcalendar'

// TODO: expose somehow
const API_BASE = 'https://www.googleapis.com/calendar/v3/calendars'

const STANDARD_PROPS = {
  url: String,
  googleCalendarApiKey: String, // TODO: rename with no prefix?
  googleCalendarId: String,
  data: null
}

registerEventSourceDef({

  parseMeta(raw) {
    if (typeof raw === 'string') {
      raw = { url: raw }
    }

    if (typeof raw === 'object') {
      let standardProps = refineProps(raw, STANDARD_PROPS)

      if (!standardProps.googleCalendarId && standardProps.url) {
        standardProps.googleCalendarId = parseGoogleCalendarId(standardProps.url)
      }

      delete standardProps.url

      if (standardProps.googleCalendarId) {
        return standardProps
      }
    }

    return null
  },

  fetch(arg, onSuccess, onFailure) {
    let calendar = arg.calendar
    let meta = arg.eventSource.meta
    let apiKey = meta.googleCalendarApiKey || calendar.opt('googleCalendarApiKey')

    if (!apiKey) {
      onFailure('Specify a googleCalendarApiKey. See http://fullcalendar.io/docs/google_calendar/')
    } else {
      let url = buildUrl(meta)
      let requestParams = buildRequestParams(
        arg.range,
        apiKey,
        meta.data,
        calendar.dateEnv
      )

      request.get(url)
        .query(requestParams)
        .end((error, res) => {
          if (res && res.body && res.body.error) {
            onFailure({
              message: 'Google Calendar API: ' + res.body.error.message,
              errors: res.body.error.errors
            })
          } else if (error) {
            onFailure({
              message: 'Google Calendar API',
              error
            })
          } else {
            onSuccess(
              gcalItemsToRawEventDefs(
                res.body.items,
                requestParams.timeZone
              )
            )
          }
        })
    }
  }
})


function parseGoogleCalendarId(url) {
  let match

  // detect if the ID was specified as a single string.
  // will match calendars like "asdf1234@calendar.google.com" in addition to person email calendars.
  if (/^[^\/]+@([^\/\.]+\.)*(google|googlemail|gmail)\.com$/.test(url)) {
    return url
  } else if (
    (match = /^https:\/\/www.googleapis.com\/calendar\/v3\/calendars\/([^\/]*)/.exec(url)) ||
    (match = /^https?:\/\/www.google.com\/calendar\/feeds\/([^\/]*)/.exec(url))
  ) {
    return decodeURIComponent(match[1])
  }
}


function buildUrl(meta) {
  return API_BASE + '/' + encodeURIComponent(meta.googleCalendarId) + '/events'
}


function buildRequestParams(range, apiKey: string, extraData, dateEnv) {
  let params
  let startStr
  let endStr

  if (dateEnv.canComputeOffset) {
    // strings will naturally have offsets, which GCal needs
    startStr = dateEnv.formatIso(range.start)
    endStr = dateEnv.formatIso(range.end)
  } else {
    // when timezone isn't known, we don't know what the UTC offset should be, so ask for +/- 1 day
    // from the UTC day-start to guarantee we're getting all the events
    // (start/end will be UTC-coerced dates, so toISOString is okay)
    startStr = addDays(range.start, -1).toISOString()
    endStr = addDays(range.end, 1).toISOString()
  }

  params = assignTo(
    extraData || {},
    {
      key: apiKey,
      timeMin: startStr,
      timeMax: endStr,
      singleEvents: true,
      maxResults: 9999
    }
  )

  // when sending timezone names to Google, only accepts underscores, not spaces
  if (dateEnv.timeZone !== 'local') {
    params.timeZone = dateEnv.timeZone.replace(' ', '_')
  }

  return params
}


function gcalItemsToRawEventDefs(items, gcalTimezone) {
  return items.map((item) => {
    return gcalItemToRawEventDef(item, gcalTimezone)
  })
}


function gcalItemToRawEventDef(item, gcalTimezone) {
  let url = item.htmlLink || null

  // make the URLs for each event show times in the correct timezone
  if (url && gcalTimezone) {
    url = injectQsComponent(url, 'ctz=' + gcalTimezone)
  }

  return {
    id: item.id,
    title: item.summary,
    start: item.start.dateTime || item.start.date, // try timed. will fall back to all-day
    end: item.end.dateTime || item.end.date, // same
    url: url,
    location: item.location,
    description: item.description
  }
}


// Injects a string like "arg=value" into the querystring of a URL
// TODO: move to a general util file?
function injectQsComponent(url, component) {
  // inject it after the querystring but before the fragment
  return url.replace(/(\?.*?)?(#|$)/, function(whole, qs, hash) {
    return (qs ? qs + '&' : '?') + component + hash
  })
}
