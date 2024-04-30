import {Environment} from "./GsClient";
import { log } from './logger.js';

let monthIndex = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
let noStack: string[] = ['update_date', 'update_time']
let noStackEventTypes: string[] = ['NEW POSTING']

export function simplifyEvent(data: any, env: Environment): unknown {

    let new_properties = data.newEvent.detail.reduce((acc: any, curr: any) => {
        let key = curr.elementName.toLowerCase().replaceAll(' ', '_')
        let newValue = (curr.newValue) ? curr.newValue.replaceAll('&amp;','&') : curr.newValue
        let oldValue = (curr.oldValue) ? curr.oldValue.replaceAll('&amp;','&') : curr.oldValue
        if (newValue !== oldValue) {
            if (env.STACK_VALUES && !noStack.includes(key) && !noStackEventTypes.includes(data.newEvent.eventName)) {
                acc[key] = [newValue, oldValue]
            } else {
                acc[key] = [newValue]
                acc[key + '__was'] = [oldValue]
            }
        } else {
            if (newValue && newValue != '') acc[key] = [newValue]
        }
        return acc;
    }, {});
    // log.silly(new_properties)

    // convert all "N" and "Y" properties to boolean
    for (let key in new_properties) {
        let values = new_properties[key];
        let newValues: any[] = [];
        values.forEach((value: any, index: number) => {
            if (value === "N" || value === "Y") {
                newValues.push(new_properties[key] === "Y")
            } else {
                newValues.push(value)
            }
        })
        new_properties[key] = newValues.length === 1 ? newValues[0] : newValues;
    }
    // remove _yn from the key
    for (let key in new_properties) {
        if (key.endsWith('_yn')) {
            new_properties[key.slice(0,-3)] = new_properties[key];
            delete new_properties[key];
        }
    }

    // convert all numerical values to number if it is numeric and does not start with 0
    for (let key in new_properties) {
        let values = new_properties[key];
        if (!Array.isArray(values)) {
            values = [values]
        }
        let newValues: any[] = [];
        values.forEach((value: any, index: number) => {
            if (value && typeof value === 'string' && !isNaN(Number(value))) {
                if (value.length > 1 && value[0] === '0') newValues.push(value)
                else newValues.push(parseFloat(value))
            } else {
                newValues.push(value)
            }
        })
        new_properties[key] = newValues.length === 1 ? newValues[0] : newValues;
    }

    new_properties['hotel_id'] = data.newEvent.hotelId;
    new_properties['publisher_id'] = parseInt(data.newEvent.publisherId);
    new_properties['primary_key'] = parseInt(data.newEvent.primaryKey);
    new_properties['action_instance_id'] = parseInt(data.newEvent.actionInstanceId);

    if (new_properties['comments']) {
        let newComments: any[] = [];
        new_properties['comments'].forEach((comment: any, index: number) => {
            newComments.push(comment.replaceAll('\n',' ').replaceAll('&quot;;','').replaceAll('&quot;',''))
        })
        new_properties['comments'] = newComments;
    }

    // parse DateTime from "28-APR-24 06.18.59.028027 AM"
    let parts = data.newEvent.timestamp.replaceAll('.','-').replaceAll(' ','-').split('-');
    let aDate = new Date(parseInt('20' + parts[2]), monthIndex.indexOf(parts[1]), parseInt(parts[0]), parts[7] == 'PM' ? parseInt(parts[3]) + 12: parseInt(parts[3]), parseInt(parts[4]), parseInt(parts[5]), parseInt(parts[6])/1000);

    // if it is 12AM, set it to 0 hours
    if (parts[7] == 'AM' && parts[3] == '12') aDate.setHours(0)

    let isoDate = aDate.toISOString()
    isoDate = isoDate.replaceAll(parts[6].slice(0,3)+'Z', parts[6]+'Z')

    return {
        "type": "track",
        // "event": data.newEvent.moduleName + ': ' + data.newEvent.eventName,
        "event": data.newEvent.eventName,
        "timestamp": isoDate,
        "properties": new_properties,
        "event_id": data.newEvent.metadata.uniqueEventId
    };
}

// console.log(simplifyJSON(sample_json));
