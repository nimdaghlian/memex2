/* lewk themer — theme + font switcher with localStorage persistence.
 * Right-click the switcher to roll a random pairing.
 *
 * To customize: edit the `themes` and `fonts` arrays below to match the
 * options you've defined in lewk.css and the themer markup.
 */
(function () {
  const root = document.documentElement;
  const themes = ['light','paper','hot','moss','ocean','dark','noir','lagoon','iris','lemon','blueprint','rose','newsprint'];
  const fonts  = ['serif','sans','block','mono','pixel'];

  function bind(attr, storageKey, options) {
    const stored = localStorage.getItem(storageKey);
    if (stored && options.includes(stored)) root.setAttribute(attr, stored);

    const mark = () => {
      const cur = root.getAttribute(attr);
      document.querySelectorAll(`[data-${attr.replace('data-','')}-set]`).forEach(b => {
        const v = b.dataset[attr.replace('data-','') + 'Set'];
        b.setAttribute('aria-pressed', v === cur);
      });
    };
    mark();
    document.querySelectorAll(`[data-${attr.replace('data-','')}-set]`).forEach(b => {
      b.addEventListener('click', () => {
        const v = b.dataset[attr.replace('data-','') + 'Set'];
        root.setAttribute(attr, v);
        localStorage.setItem(storageKey, v);
        mark();
      });
    });
    return { mark, set: v => { root.setAttribute(attr, v); localStorage.setItem(storageKey, v); mark(); } };
  }

  const themeCtl = bind('data-theme', 'lewk-theme', themes);
  const fontCtl  = bind('data-font',  'lewk-font',  fonts);

  const switcher = document.querySelector('.themer');
  if (switcher) {
    switcher.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      themeCtl.set(themes[Math.floor(Math.random() * themes.length)]);
      fontCtl.set(fonts[Math.floor(Math.random()  * fonts.length)]);
    });
  }
})();
