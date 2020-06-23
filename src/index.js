import "./style.scss";
import * as uiActions from "./ui/ui-actions";

const Config = require("./config");
const StellarSdk = require("stellar-sdk");

/**
 * State maintained between steps
 * @typedef {Object} State
 * @property {StellarSdk.Network} network - Stellar network to operate on
 * @property {string} horizonURL - Horizon URL to use
 *
 * From stellar.toml
 * @property {string} auth_server - URL hosting the SEP10 auth server
 * @property {string} send_server - URL hosting the SEP31 DIRECT_PAYMENT_SERVER
 *
 * SEP10
 * @property {string} challenge_transaction - XDR Representation of Stellar challenge transaction signed by server only
 * @property {Object} signed_challenge_tx - Stellar transaction challenge signed by both server and client
 * @property {string} token - JWT token representing authentication with stellar address from SEP10
 *
 * Send
 * @property {object} fields - Fields required from sending anchors /info endpoint
 * @property {object} field_values - User inputted field values that match the above fields descriptions
 * @property {string} asset_code - asset code for sending
 * @property {string} asset_issuer - asset issuer for sending
 * @property {string} send_memo - memo to use when sending payment
 * @property {string} send_memo_type - memo type to use when sending payment
 * @property {string} transaction_id - Anchor identifier for transaction
 * @property {string} receiver_address - The Stellar public key for the receiving anchor
 *
 */

/**
 * @type State
 */
const state = {
  begin_time: new Date().toISOString(),
};

Config.listen(() => {
  const disclaimer = document.getElementById("pubnet-disclaimer");
  if (Config.get("PUBNET")) {
    disclaimer.classList.add("visible");
    state.network = StellarSdk.Networks.PUBLIC;
  } else {
    disclaimer.classList.remove("visible");
    state.network = StellarSdk.Networks.TESTNET;
  }
  state.horizonURL = Config.get("HORIZON_URL");
});

Config.installUI(document.querySelector("#config-panel"));
if (!Config.isValid()) {
  uiActions.showConfig();
}

const steps = [
  require("./steps/send/check_toml"),
  require("./steps/send/check_info"),
  require("./steps/send/collect_info"),
  require("./steps/SEP10/start"),
  require("./steps/SEP10/sign"),
  require("./steps/SEP10/send"),
  require("./steps/send/post_send"),
  require("./steps/send/poll_transaction"),
  require("./steps/send/send_payment"),
];

uiActions.instruction("Initiate a direct payment request");
uiActions.setLoading(true, "Waiting for user...");
uiActions.waitForPageMessage("pages/send-client.html").then((message) => {
  uiActions.setLoading(false);
  if (message === "start-send") {
    next();
  }
});

let currentStep = null;
const runStep = (step) => {
  if (!step) {
    uiActions.finish();
    return;
  }
  uiActions.instruction(step.instruction);
  currentStep = step;
  if (Config.get("AUTO_ADVANCE") || step.autoStart) next();
};

const nextActiveStep = () => {
  if (steps.length == 0) return null;
  while (steps[0].shouldSkip && steps[0].shouldSkip(state)) {
    steps.splice(0, 1);
  }
  return steps[0];
};

const next = async () => {
  if (currentStep && currentStep.execute) {
    uiActions.setLoading(true);
    try {
      await currentStep.execute(state, uiActions);
      steps.splice(0, 1);
    } catch (e) {
      uiActions.error(e);
      uiActions.setLoading(false);
      throw e;
    }
    const nextStep = nextActiveStep();
    const nextAction = nextStep && nextStep.action;
    uiActions.setLoading(false, nextAction);
  }
  runStep(nextActiveStep());
};

uiActions.onNext(next);
