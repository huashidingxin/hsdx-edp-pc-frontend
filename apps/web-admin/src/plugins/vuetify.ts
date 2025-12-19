/**
 * plugins/vuetify.ts
 *
 * Framework documentation: https://vuetifyjs.com`
 */

// Composables
import { createVuetify } from 'vuetify';
import { VDateInput } from 'vuetify/labs/VDateInput'
import { VFileUpload } from 'vuetify/labs/VFileUpload'

import 'vuetify/styles';

// Styles
import '@mdi/font/css/materialdesignicons.css';

// https://vuetifyjs.com/en/introduction/why-vuetify/#feature-guides
export default createVuetify({
  defaults: {
    VAutocomplete: {
      variant: 'underlined',
    },
    VBtn: {
      variant: 'flat',
    },
    VSelect: {
      variant: 'underlined',
    },
    VTextField: {
      variant: 'underlined',
    },
  },
  theme: {
    defaultTheme: 'dark',
  },
  components: {
    VDateInput,
    VFileUpload
  },
});

(function () {
  const d: any = {};
  const isMovable = (targ: any) => {
    return targ.classList?.contains('movable');
  };
  document.addEventListener('mousedown', (e: any) => {
    const closestDialog = e.target.closest('.v-overlay__content');
    const title = closestDialog?.querySelector('.v-card-title');
    if (
      // eslint-disable-next-line eqeqeq
      (e.button === 0 && closestDialog != null && isMovable(e.target)) ||
      isMovable(e.target.parentNode)
    ) {
      d.el = closestDialog; // movable element
      d.handle = title; // enable dlg to be moved down beyond bottom
      d.mouseStartX = e.clientX;
      d.mouseStartY = e.clientY;
      d.elStartX = d.el.getBoundingClientRect().left;
      d.elStartY = d.el.getBoundingClientRect().top;
      d.el.style.position = 'fixed';
      d.el.style.margin = 0;
      d.oldTransition = d.el.style.transition;
      d.el.style.transition = 'none';
    }
  });
  document.addEventListener('mousemove', (e) => {
    if (d.el === undefined) return;
    d.el.style.left = `${Math.min(
      Math.max(d.elStartX + e.clientX - d.mouseStartX, 0),
      window.innerWidth - d.el.getBoundingClientRect().width,
    )}px`;
    d.el.style.top = `${Math.min(
      Math.max(d.elStartY + e.clientY - d.mouseStartY, 0),
      window.innerHeight - d.handle.getBoundingClientRect().height,
    )}px`;
  });
  document.addEventListener('mouseup', () => {
    if (d.el === undefined) return;
    d.el.style.transition = d.oldTransition;
    d.el = undefined;
  });
})();
