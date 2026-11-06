import createElement from '../../assets/vendor/lucide/createElement.mjs';
import ClipboardCheck from '../../assets/vendor/lucide/icons/clipboard-check.mjs';
import ContactRound from '../../assets/vendor/lucide/icons/contact-round.mjs';
import FolderKanban from '../../assets/vendor/lucide/icons/folder-kanban.mjs';
import UsersRound from '../../assets/vendor/lucide/icons/users-round.mjs';

const icons = { FolderKanban, ClipboardCheck, UsersRound, ContactRound };

export function createIcon(name, options = {}) {
  const icon = icons[name];
  if (!icon) {
    console.warn('Homepage icon not found:', name);
    return document.createElement('span');
  }
  const { size = 20, color = 'currentColor' } = options;
  const element = createElement(icon);
  element.setAttribute('width', String(size));
  element.setAttribute('height', String(size));
  element.setAttribute('stroke', color);
  element.setAttribute('fill', 'none');
  element.setAttribute('aria-hidden', 'true');
  element.style.display = 'inline-block';
  element.style.verticalAlign = 'middle';
  return element;
}
