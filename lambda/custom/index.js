/* eslint-disable  func-names */
/* eslint-disable  no-console */

const Alexa = require('ask-sdk-core');
const axios = require('axios');

//To deploy the skill, provide a tokens file containing the token JSON 
//generated by the Resources/tokengenerator.sh shell script.
const tokens = require('private/tokens.json');

//API URIs
const baseApiUri = 'https://owner-api.teslamotors.com';
const getVehiclesUri = '/api/1/vehicles';

const userAgent = 'Nikola Skill/1.0-alpha'
const fallbackSpeechText = 'I don\'t have an answer for that yet';
const errorSpeechText = 'Uh oh! Something went wrong. I logged the error and will work on it tonight.';

const axiosClient = axios.create({
    baseURL: baseApiUri,
    timeout: 15000,
    headers: {
        'User-Agent': userAgent,
        'Authorization': 'Bearer ' + tokens.access_token
    }
});

const LaunchRequestHandler = {
  canHandle(handlerInput) {
    return handlerInput.requestEnvelope.request.type === 'LaunchRequest';
  },
  async handle(handlerInput) {
    console.log(JSON.stringify(handlerInput.requestEnvelope));
    var speechText = fallbackSpeechText;
    const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
    var skillResponse = null;

    try
    {
        var response = await axiosClient.get(getVehiclesUri);
        console.log('GetVehicles response ' + JSON.stringify(response.data));

        if(response.data.count == 0)
        {
            console.log('No Tesla vehicles owned.');
            speechText = 'Looks like you don\'t own any Tesla vehicles. Goodbye!';

            skillResponse =  handlerInput.responseBuilder
                .speak(speechText)
                .withShouldEndSession(true)
                .getResponse();
        }

        console.log(response.data.count + ' Tesla vehicles owned.');
        var firstVehicle = response.data.response[0];        
        speechText = 'Looks like ' + firstVehicle.display_name + ' is ' + firstVehicle.state + '. ';

        if(firstVehicle.state == 'asleep' || firstVehicle.state == 'offline')
        {
            sessionAttributes.nextCommand = 'wake';
            speechText += 'Do you want me to try waking up ' + firstVehicle.display_name + '?';
        }
        else
        {
            sessionAttributes.nextCommand = 'getChargeStatus';
            speechText += 'Do you want to know '+ firstVehicle.display_name + '\'s charge status?';
        }

        sessionAttributes.currentTeslaId = firstVehicle.id;
        sessionAttributes.currentTeslaName = firstVehicle.display_name;
        sessionAttributes.currentTeslaState = firstVehicle.state;
        handlerInput.attributesManager.setSessionAttributes(sessionAttributes);

        skillResponse =  handlerInput.responseBuilder
            .speak(speechText)
            .withSimpleCard(firstVehicle.display_name, speechText)
            .withShouldEndSession(false)
            .getResponse();
    }
    catch(error)
    {
        console.log ('GetVehicles error: ' + error);
        console.log ('GetVehicles request: ' + error.request);

        speechText = errorSpeechText;
        skillResponse = handlerInput.responseBuilder
            .speak(speechText)
            .withSimpleCard('Oops!', speechText)
            .getResponse();
    }

    console.log('Response: ' + JSON.stringify(skillResponse));
    return skillResponse;
  },
};

const YesIntentHandler = {
    canHandle(handlerInput) {
      return handlerInput.requestEnvelope.request.type === 'IntentRequest'
        && handlerInput.requestEnvelope.request.intent.name === 'AMAZON.YesIntent';
    },
    async handle(handlerInput) {
        console.log(JSON.stringify(handlerInput.requestEnvelope));
        var speechText = fallbackSpeechText;
        const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
        var skillResponse = null;

        if(sessionAttributes.nextCommand == 'getChargeStatus')
        {
            skillResponse = await getChargeStateResponse(handlerInput, true);
        }
        else if(sessionAttributes.nextCommand == 'wake')
        {
            skillResponse = await wakeCar(handlerInput);
        }

        console.log('Response: ' + JSON.stringify(skillResponse));
        return skillResponse;
    },
  };


const ChargeStatusIntentHandler = {
canHandle(handlerInput) {
    return handlerInput.requestEnvelope.request.type === 'IntentRequest'
    && handlerInput.requestEnvelope.request.intent.name === 'ChargeStatusIntent';
},
handle(handlerInput) {
    axiosClient.get(getVehiclesUri)
        .then(response => {
            console.log('ChargeStatusIntentHandler response');
            console.log(response);
        })
        .catch(error => {
            console.log('ChargeStatusIntentHandler error');
            console.log (error);
        });

    const speechText = 'I don\'t have an answer for that just yet';

    return handlerInput.responseBuilder
        .speak(speechText)
        .withSimpleCard('I don\'t have an answer for that just yet', speechText)
        .getResponse();
},
};

const HelpIntentHandler = {
  canHandle(handlerInput) {
    return handlerInput.requestEnvelope.request.type === 'IntentRequest'
      && handlerInput.requestEnvelope.request.intent.name === 'AMAZON.HelpIntent';
  },
  handle(handlerInput) {
    const speechText = 'You can say hello to me!';

    return handlerInput.responseBuilder
      .speak(speechText)
      .reprompt(speechText)
      .withSimpleCard('Hello World', speechText)
      .getResponse();
  },
};

const CancelAndStopIntentHandler = {
  canHandle(handlerInput) {
    return handlerInput.requestEnvelope.request.type === 'IntentRequest'
      && (handlerInput.requestEnvelope.request.intent.name === 'AMAZON.CancelIntent'
        || handlerInput.requestEnvelope.request.intent.name === 'AMAZON.StopIntent');
  },
  handle(handlerInput) {
    const speechText = 'Goodbye!';

    return handlerInput.responseBuilder
      .speak(speechText)
      .withSimpleCard('Goodbye!', speechText)
      .getResponse();
  },
};

const SessionEndedRequestHandler = {
  canHandle(handlerInput) {
    return handlerInput.requestEnvelope.request.type === 'SessionEndedRequest';
  },
  handle(handlerInput) {
    console.log(`Session ended with reason: ${handlerInput.requestEnvelope.request.reason}`);

    return handlerInput.responseBuilder.getResponse();
  },
};

const ErrorHandler = {
  canHandle() {
    return true;
  },
  handle(handlerInput, error) {
    console.log(`Error handled: ${error.message}`);

    return handlerInput.responseBuilder
      .speak('Sorry, I can\'t understand the command. Please say again.')
      .reprompt('Sorry, I can\'t understand the command. Please say again.')
      .getResponse();
  },
};

async function getChargeStateResponse(handlerInput, clearNextCommand)
{
    var skillResponse = null;
    const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
    var id = sessionAttributes.currentTeslaId;
    const chargeStateUri = `/api/1/vehicles/${id}/data_request/charge_state`;

    try
    {
        var response = await axiosClient.get(chargeStateUri);
        console.log('ChargeState response ' + JSON.stringify(response.data));
        var chargeResponse = response.data.response;
        
        speechText = `${sessionAttributes.currentTeslaName} has a range of ` + 
        `${chargeResponse.battery_range} miles. Current charge state is ${chargeResponse.charging_state}`;

        sessionAttributes.battery_range = chargeResponse.battery_range;
        sessionAttributes.charging_state = chargeResponse.charging_state;
        if(clearNextCommand)
        {
            sessionAttributes.nextCommand = null;
        }

        handlerInput.attributesManager.setSessionAttributes(sessionAttributes);

        return  handlerInput.responseBuilder
            .speak(speechText)
            .withSimpleCard(sessionAttributes.currentTeslaName, speechText)
            .getResponse();
    }
    catch(error)
    {
        console.log ('ChargeState error: ' + error);
        console.log ('ChargeState request: ' + JSON.stringify(error.request));

        speechText = errorSpeechText;
        return handlerInput.responseBuilder
            .speak(speechText)
            .withSimpleCard('Oops!', speechText)
            .getResponse();
    }
}

async function wakeCar(handlerInput)
{
    var skillResponse = null;
    const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
    var id = sessionAttributes.currentTeslaId;
    const wakeUri = `/api/1/vehicles/${id}/wake_up`;

    try
    {
        var response = await axiosClient.post(wakeUri);
        console.log('Wake response ' + JSON.stringify(response.data));
        var wakeResponse = response.data.response;

        sessionAttributes.currentTeslaId = wakeResponse.id;
        sessionAttributes.currentTeslaName = wakeResponse.display_name;
        sessionAttributes.currentTeslaState = wakeResponse.state;
        sessionAttributes.nextCommand = 'chargeStatus';
        
        speechText = `${sessionAttributes.currentTeslaName} is now ${sessionAttributes.currentTeslaState}. ` +
        `Did you want me to get the charging status?`;

        handlerInput.attributesManager.setSessionAttributes(sessionAttributes);

        return handlerInput.responseBuilder
            .speak(speechText)
            .withSimpleCard(sessionAttributes.currentTeslaName, speechText)
            .withShouldEndSession(false)
            .getResponse();
    }
    catch(error)
    {
        console.log ('wakeCar error: ' + error);
        console.log ('wakeCar request: ' + JSON.stringify(error.request));

        speechText = errorSpeechText;
        return handlerInput.responseBuilder
            .speak(speechText)
            .withSimpleCard('Oops!', speechText)
            .getResponse();
    }
}

const skillBuilder = Alexa.SkillBuilders.custom();

exports.handler = skillBuilder
  .addRequestHandlers(
    LaunchRequestHandler,
    YesIntentHandler,
    ChargeStatusIntentHandler,
    HelpIntentHandler,
    CancelAndStopIntentHandler,
    SessionEndedRequestHandler
  )
  .addErrorHandlers(ErrorHandler)
  .lambda();
