var PPD = PPD || {};

PPD.EntryPoints = (function () {
  function safeText(error) {
    return { text: PPD.Errors.publicMessage(error) + ' Nothing was queued or changed.' };
  }

  function submit(envelope, dependencies) {
    return dependencies.transport.send(envelope);
  }

  function formValue(event, name) {
    var input = event && event.common && event.common.formInputs
      ? event.common.formInputs[name]
      : null;
    var wrapped = input && input[''] ? input[''] : input;
    var values = wrapped && wrapped.stringInputs && wrapped.stringInputs.value;
    return Array.isArray(values) && values.length ? String(values[0]) : '';
  }

  function actionParameters(event, keys) {
    var output = {};
    var common = event && event.common && event.common.parameters;
    if (common) {
      keys.forEach(function (key) {
        if (typeof common[key] === 'string') output[key] = common[key];
      });
    }
    var legacy = event && event.action && event.action.parameters;
    if (Array.isArray(legacy)) {
      legacy.forEach(function (item) {
        if (item && keys.indexOf(item.key) !== -1 && typeof item.value === 'string') {
          output[item.key] = item.value;
        }
      });
    }
    return output;
  }

  function onMessage(event, dependencies) {
    try {
      var envelope = PPD.Envelopes.intake(event, dependencies.config);
      return PPD.Cards.status(submit(envelope, dependencies));
    } catch (error) {
      return safeText(error);
    }
  }

  function onAddToSpace(event, dependencies) {
    try {
      var scope = PPD.ScopePolicy.fromEvent(event);
      var envelope = PPD.Envelopes.spaceLifecycle(event, dependencies.config, 'space.added');
      return PPD.Cards.welcome(scope, submit(envelope, dependencies));
    } catch (error) {
      return safeText(error);
    }
  }

  function onRemoveFromSpace(event, dependencies) {
    try {
      submit(PPD.Envelopes.spaceLifecycle(event, dependencies.config, 'space.removed'), dependencies);
    } catch (error) {
      console.warn('PPD_CHAT_REMOVE_EVENT_REJECTED', error && error.code || 'UNKNOWN');
    }
  }

  function onCardClick(event, dependencies) {
    try {
      var invoked = event && event.common && event.common.invokedFunction ||
        event && event.action && event.action.actionMethodName || '';
      if (invoked === 'submitClarification') {
        var clarificationParameters = actionParameters(event, [
          'clarificationHandle', 'requestId', 'correlationId',
        ]);
        var clarification = PPD.Envelopes.clarification(
          event,
          dependencies.config,
          clarificationParameters,
          formValue(event, 'clarification')
        );
        return PPD.Cards.dialogStatus(submit(clarification, dependencies));
      }

      var decisionParameters = PPD.Approvals.parametersFromEvent(event);
      if (decisionParameters.decision === 'amend' && event.dialogEventType !== 'SUBMIT_DIALOG') {
        return PPD.Cards.amendDialog(decisionParameters);
      }
      if (decisionParameters.decision === 'amend') {
        var amendment = PPD.Approvals.amendmentFromEvent(
          event,
          dependencies.config,
          formValue(event, 'amendment')
        );
        return PPD.Cards.dialogStatus(submit(amendment, dependencies));
      }
      return PPD.Cards.status(submit(PPD.Approvals.fromEvent(event, dependencies.config), dependencies));
    } catch (error) {
      if (event && event.dialogEventType === 'SUBMIT_DIALOG') {
        return PPD.Cards.dialogStatus({ state: 'rejected' });
      }
      return safeText(error);
    }
  }

  return Object.freeze({
    onAddToSpace: onAddToSpace,
    onMessage: onMessage,
    onCardClick: onCardClick,
    onRemoveFromSpace: onRemoveFromSpace,
    formValue: formValue,
  });
}());

function onAddToSpace(event) {
  return PPD.EntryPoints.onAddToSpace(event, PPD.Config.runtime());
}

function onMessage(event) {
  return PPD.EntryPoints.onMessage(event, PPD.Config.runtime());
}

function onCardClick(event) {
  return PPD.EntryPoints.onCardClick(event, PPD.Config.runtime());
}

function onRemoveFromSpace(event) {
  PPD.EntryPoints.onRemoveFromSpace(event, PPD.Config.runtime());
}

function handleApprovalAction(event) {
  return onCardClick(event);
}

function submitApprovalAmendment(event) {
  return onCardClick(event);
}

function submitClarification(event) {
  return onCardClick(event);
}
