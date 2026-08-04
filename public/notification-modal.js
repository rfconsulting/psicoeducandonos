(function initializeNotificationModal(global) {
  'use strict';

  const allowedTypes = new Set(['success', 'info', 'error']);
  let activeDialog = null;
  let previousFocus = null;

  function buildIcon(type) {
    const icon = document.createElement('span');
    icon.className = `notification-modal__icon notification-modal__icon--${type}`;
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = type === 'success' ? '✓' : type === 'error' ? '!' : 'i';
    return icon;
  }

  function closeDialog(dialog) {
    if (dialog.open) dialog.close();
    else dialog.remove();
  }

  function show(options = {}) {
    const type = allowedTypes.has(options.type) ? options.type : 'info';
    const title = String(options.title || 'Notificación');
    const message = String(options.message || '');
    const buttonLabel = String(options.buttonLabel || 'Entendido');

    if (activeDialog) closeDialog(activeDialog);
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const dialog = document.createElement('dialog');
    dialog.className = 'notification-modal';
    dialog.setAttribute('aria-labelledby', 'notification-modal-title');
    dialog.setAttribute('aria-describedby', 'notification-modal-message');

    const content = document.createElement('div');
    content.className = 'notification-modal__content';
    content.appendChild(buildIcon(type));

    const heading = document.createElement('h2');
    heading.id = 'notification-modal-title';
    heading.textContent = title;
    content.appendChild(heading);

    const description = document.createElement('p');
    description.id = 'notification-modal-message';
    description.textContent = message;
    content.appendChild(description);

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'submit-button notification-modal__button';
    closeButton.textContent = buttonLabel;
    closeButton.addEventListener('click', () => closeDialog(dialog));
    content.appendChild(closeButton);
    dialog.appendChild(content);

    const completed = new Promise(resolve => {
      dialog.addEventListener('close', () => {
        dialog.remove();
        activeDialog = null;
        if (previousFocus?.isConnected) previousFocus.focus();
        previousFocus = null;
        resolve();
      }, { once: true });
    });

    dialog.addEventListener('cancel', event => {
      event.preventDefault();
      closeDialog(dialog);
    });

    document.body.appendChild(dialog);
    activeDialog = dialog;
    dialog.showModal();
    closeButton.focus();
    return completed;
  }

  global.NotificationModal = Object.freeze({ show });
})(window);
