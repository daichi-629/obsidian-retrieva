export const PLUGIN_ID = "retrieva" as const;
export const PLUGIN_NAME = "Retrieva" as const;
export const IDENTIFIERS = Object.freeze({
  cardTag: `${PLUGIN_ID}-card`,
  presetKey: `${PLUGIN_ID}-preset`,
  siblingGroupKey: `${PLUGIN_ID}-sibling-group`,
  cardFormatKey: `${PLUGIN_ID}-format`,
  presetDefinitionKey: `${PLUGIN_ID}-preset-definition`,
  presetIdKey: `${PLUGIN_ID}-preset-id`,
  answerMarker: `${PLUGIN_NAME.toUpperCase()}-ANSWER`,
  cardMarker: `${PLUGIN_NAME.toUpperCase()}-CARD`,
  logMarker: `${PLUGIN_NAME.toUpperCase()}-LOG`,
});

export const MARKERS = Object.freeze({
  answer: `<!--${IDENTIFIERS.answerMarker}-->`,
  cardPrefix: `<!--${IDENTIFIERS.cardMarker} `,
  logStart: `<!--${IDENTIFIERS.logMarker}`,
  logEnd: `${IDENTIFIERS.logMarker}-->`,
});
