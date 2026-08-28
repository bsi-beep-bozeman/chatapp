var PPD = PPD || {};

PPD.Cards = (function () {
  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function parameters(snapshot, decision) {
    return [
      { key: 'decision', value: decision },
      { key: 'approvalHandle', value: snapshot.approvalHandle },
      { key: 'requestId', value: snapshot.requestId },
      { key: 'correlationId', value: snapshot.correlationId },
      { key: 'expectedActionPayloadHash', value: snapshot.actionPayloadHash },
    ];
  }

  function actionButton(text, decision, snapshot, interaction) {
    var action = {
      function: 'handleApprovalAction',
      parameters: parameters(snapshot, decision),
    };
    if (interaction) action.interaction = interaction;
    return { text: text, onClick: { action: action } };
  }

  function approval(snapshot) {
    if (!snapshot || !/^apr_[a-f0-9]{32}$/.test(String(snapshot.approvalHandle || '')) ||
        !/^[a-f0-9]{64}$/.test(String(snapshot.actionPayloadHash || ''))) {
      throw PPD.Errors.create('APPROVAL_CARD_INVALID', 'The approval card cannot be rendered safely.');
    }
    var detail = '<b>Exact action:</b> ' + escapeHtml(snapshot.actionSummary) +
      '<br><b>Target:</b> ' + escapeHtml(snapshot.target) +
      '<br><b>Payload hash:</b> <code>' + snapshot.actionPayloadHash.slice(0, 12) + '</code>' +
      '<br><b>Expires:</b> ' + escapeHtml(snapshot.expiresAt);
    return {
      cardsV2: [{
        cardId: 'approval-' + snapshot.approvalHandle,
        card: {
          header: { title: 'Approval required', subtitle: 'No action occurs until the Chief of Staff validates the decision.' },
          sections: [
            { widgets: [{ textParagraph: { text: detail } }] },
            { widgets: [{ buttonList: { buttons: [
              actionButton('Approve', 'approve', snapshot),
              actionButton('Reject', 'reject', snapshot),
              actionButton('Amend', 'amend', snapshot, 'OPEN_DIALOG'),
              actionButton('Explain', 'explain', snapshot),
              actionButton('Remind Me', 'remind_me', snapshot),
            ] } }] },
          ],
        },
      }],
    };
  }

  function status(result) {
    var messages = {
      accepted: 'Request received. The Chief of Staff will evaluate identity and access before retrieval.',
      duplicate: 'This request was already received.',
      rejected: 'Request not accepted. Review the request and try again.',
      unavailable: 'Chief of Staff intake is not connected yet. Nothing was queued or changed.',
    };
    return { text: messages[result && result.state] || messages.unavailable };
  }

  function actionParameters(parameters, decision) {
    var pairs = [];
    Object.keys(parameters).forEach(function (key) {
      if (['approvalHandle', 'requestId', 'correlationId', 'expectedActionPayloadHash'].indexOf(key) !== -1) {
        pairs.push({ key: key, value: String(parameters[key]) });
      }
    });
    pairs.push({ key: 'decision', value: decision });
    return pairs;
  }

  function amendDialog(parameters) {
    return {
      actionResponse: {
        type: 'DIALOG',
        dialogAction: {
          dialog: {
            body: {
              sections: [{ widgets: [
                { textInput: { name: 'amendment', label: 'Exact amendment', type: 'MULTIPLE_LINE' } },
                { buttonList: { buttons: [{
                  text: 'Submit amendment',
                  onClick: { action: {
                    function: 'submitApprovalAmendment',
                    parameters: actionParameters(parameters, 'amend'),
                  } },
                }] } },
              ] }],
            },
          },
        },
      },
    };
  }

  function clarificationDialog(parameters, question) {
    return {
      actionResponse: {
        type: 'DIALOG',
        dialogAction: {
          dialog: {
            body: {
              sections: [{ widgets: [
                { textParagraph: { text: escapeHtml(question) } },
                { textInput: { name: 'clarification', label: 'Answer', type: 'MULTIPLE_LINE' } },
                { buttonList: { buttons: [{
                  text: 'Submit answer',
                  onClick: { action: {
                    function: 'submitClarification',
                    parameters: Object.keys(parameters).map(function (key) {
                      return { key: key, value: String(parameters[key]) };
                    }),
                  } },
                }] } },
              ] }],
            },
          },
        },
      },
    };
  }

  function dialogStatus(result) {
    var message = status(result).text;
    return {
      actionResponse: {
        type: 'DIALOG',
        dialogAction: {
          actionStatus: {
            statusCode: result && ['accepted', 'duplicate'].indexOf(result.state) !== -1
              ? 'OK'
              : 'FAILED_PRECONDITION',
            userFacingMessage: message,
          },
        },
      },
    };
  }

  function welcome(scope, result) {
    var boundary = scope.channel === 'dm'
      ? 'This direct message can carry personalized responses after access checks.'
      : 'This shared space receives shared-scope acknowledgements only; sensitive results require a direct message.';
    return {
      text: 'PPD Chief of Staff Chat is a proposal-only control surface. ' + boundary + ' ' + status(result).text,
    };
  }

  return Object.freeze({
    approval: approval,
    amendDialog: amendDialog,
    clarificationDialog: clarificationDialog,
    dialogStatus: dialogStatus,
    status: status,
    welcome: welcome,
    escapeHtml: escapeHtml,
  });
}());
