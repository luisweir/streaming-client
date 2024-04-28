let monthIndex = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

export function simplifyJSON(data: any): unknown {

    let new_properties = data.newEvent.detail.reduce((acc: any, curr: any) => {
        acc[curr.elementName.toLowerCase().replaceAll(' ','_')] = curr.newValue || curr.oldValue;
        return acc;
    }, {});

    // convert all "N" and "Y" properties to boolean
    for (let key in new_properties) {
        if (new_properties[key] === "N" || new_properties[key] === "Y") {
            new_properties[key] = new_properties[key] === "Y";
        }
    }
    // remove _yn from the key
    for (let key in new_properties) {
        if (key.endsWith('_yn')) {
            new_properties[key.slice(0,-3)] = new_properties[key];
            delete new_properties[key];
        }
    }

    new_properties['hotel_id'] = data.newEvent.hotelId;
    new_properties['publisher_id'] = parseInt(data.newEvent.publisherId);
    new_properties['primary_key'] = parseInt(data.newEvent.primaryKey);
    new_properties['action_instance_id'] = parseInt(data.newEvent.actionInstanceId);

    if (new_properties['comments']) {
        new_properties['comments'] = new_properties['comments'].replaceAll('\n',' ');
    }

    // parse DateTime from "28-APR-24 06.18.59.028027 AM"
    let parts = data.newEvent.timestamp.replaceAll('.','-').replaceAll(' ','-').split('-');

    let aDate = new Date(parseInt('20' + parts[2]), monthIndex.indexOf(parts[1]), parseInt(parts[0]), parts[7] == 'PM' ? parseInt(parts[3]) + 12: parseInt(parts[3]), parseInt(parts[4]), parseInt(parts[5]), parseInt(parts[6])/1000);
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
