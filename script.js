(function () {
  'use strict';
  var root = document.documentElement;
  root.classList.add('js');
  var toggle = document.querySelector('.menu-toggle');
  var panel = document.querySelector('.mobile-panel');

  function setMenu(open) {
    root.classList.toggle('nav-open', open);
    if (toggle) {
      toggle.setAttribute('aria-expanded', String(open));
      var label = toggle.querySelector('span');
      if (label) label.textContent = open ? 'Stäng' : 'Meny';
    }
  }
  if (toggle) {
    toggle.addEventListener('click', function () {
      setMenu(!root.classList.contains('nav-open'));
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && root.classList.contains('nav-open')) {
        setMenu(false);
        toggle.focus();
      }
    });
    if (panel) panel.addEventListener('click', function (event) {
      if (event.target.closest('a')) setMenu(false);
    });
    if (window.matchMedia) {
      var desktop = window.matchMedia('(min-width: 921px)');
      var resetMenu = function (event) { if (event.matches) setMenu(false); };
      if (desktop.addEventListener) desktop.addEventListener('change', resetMenu);
      else if (desktop.addListener) desktop.addListener(resetMenu);
    }
  }

  // Content stays visible if JavaScript or observation is unavailable.
  var elements = document.querySelectorAll('.reveal');
  var reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if ('IntersectionObserver' in window && !reducedMotion) {
    try {
      var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        });
      }, { threshold: 0, rootMargin: '0px 0px -24px 0px' });
      root.classList.add('reveal-ready');
      elements.forEach(function (element) { observer.observe(element); });
    } catch (error) {
      root.classList.remove('reveal-ready');
      elements.forEach(function (element) { element.classList.add('is-visible'); });
    }
  } else {
    elements.forEach(function (element) { element.classList.add('is-visible'); });
  }
  requestAnimationFrame(function () { root.classList.add('loaded'); });

  var form = document.getElementById('bookingForm');
  if (!form) return;
  var date = form.querySelector('#date');
  var time = form.querySelector('#time');
  var nameInput = form.querySelector('#name');
  var status = document.getElementById('formStatus');
  var hint = document.getElementById('bookingHoursHint');
  var fallback = document.getElementById('bookingFallback');
  var message = document.getElementById('bookingMessage');
  var copyButton = document.getElementById('copyBooking');
  // Sunday through Saturday; minutes after midnight. Confirmed 2026-10-15.
  var hours = [[780, 1380], null, null, [960, 1380], [960, 1380], [960, 1440], [780, 1440]];

  function stockholmNow() {
    var parts = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(new Date());
    var values = {};
    parts.forEach(function (part) { values[part.type] = part.value; });
    return { date: values.year + '-' + values.month + '-' + values.day,
      minutes: Number(values.hour) * 60 + Number(values.minute) };
  }
  function clock(minutes) {
    if (minutes === 1440) return '00:00';
    return String(Math.floor(minutes / 60)).padStart(2, '0') + ':' + String(minutes % 60).padStart(2, '0');
  }
  function validateVisit() {
    var now = stockholmNow();
    date.min = now.date;
    date.setCustomValidity('');
    time.setCustomValidity('');
    time.removeAttribute('min');
    time.removeAttribute('max');
    hint.textContent = 'Välj datum för att se dagens öppettider. Alla tider avser Stockholm.';
    if (!date.value) return;
    var selected = new Date(date.value + 'T12:00:00Z');
    if (Number.isNaN(selected.getTime()) || selected.toISOString().slice(0, 10) !== date.value) {
      date.setCustomValidity('Välj ett giltigt datum.');
      return;
    }
    if (date.value < now.date) {
      date.setCustomValidity('Välj dagens datum eller ett senare datum.');
      return;
    }
    var range = hours[selected.getUTCDay()];
    if (!range) {
      date.setCustomValidity('Gojo har stängt måndagar och tisdagar. Välj onsdag till söndag.');
      hint.textContent = 'Stängt den här dagen. Välj onsdag till söndag.';
      return;
    }
    time.min = clock(range[0]);
    time.max = clock(range[1] - 1);
    hint.textContent = 'Öppet ' + clock(range[0]) + '–' + clock(range[1]) + '. Tiderna avser Stockholm; lediga bord bekräftas av restaurangen.';
    if (!time.value) return;
    var components = time.value.split(':');
    var minutes = Number(components[0]) * 60 + Number(components[1]);
    if (!/^\d{2}:\d{2}$/.test(time.value) || Number(components[1]) > 59 || minutes < range[0] || minutes >= range[1]) {
      time.setCustomValidity('Välj en tid inom öppettiden ' + clock(range[0]) + '–' + clock(range[1]) + '.');
    } else if (date.value === now.date && minutes <= now.minutes) {
      time.setCustomValidity('Den tiden har redan passerat i Stockholm. Välj en senare tid eller ett annat datum.');
    }
  }
  function validateName() {
    nameInput.setCustomValidity(nameInput.value.trim() ? '' : 'Fyll i ditt namn.');
  }
  date.addEventListener('input', validateVisit);
  date.addEventListener('change', validateVisit);
  time.addEventListener('input', validateVisit);
  nameInput.addEventListener('input', validateName);
  form.addEventListener('input', function () {
    status.textContent = '';
    fallback.hidden = true;
    message.value = '';
  });
  form.addEventListener('submit', function (event) {
    event.preventDefault();
    validateName();
    validateVisit();
    if (!form.reportValidity()) return;
    var data = new FormData(form);
    var subject = 'Bokningsförfrågan Gojo – ' + date.value + ' ' + time.value;
    var body = 'Hej Gojo!\n\nJag vill gärna skicka en bokningsförfrågan.\n\n' +
      'Namn: ' + nameInput.value.trim() + '\nE-post: ' + String(data.get('email') || '').trim() +
      '\nTelefon: ' + String(data.get('phone') || '').trim() + '\nAntal gäster: ' + data.get('persons') +
      '\nDatum: ' + date.value + '\nTid: ' + time.value + ' (Stockholm)' +
      '\n\nÖvrigt: ' + String(data.get('note') || '').trim() +
      '\n\nJag förstår att bokningen inte är bekräftad förrän restaurangen har svarat.';
    message.value = 'Till: info@gojorestaurang.se\nÄmne: ' + subject + '\n\n' + body;
    fallback.hidden = false;
    status.textContent = 'Skicka det färdiga mejlet i din e-postapp. Om inget öppnas kan du kopiera förfrågan nedan. Ingen förfrågan har skickats automatiskt.';
    window.location.href = 'mailto:info@gojorestaurang.se?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
  });
  copyButton.addEventListener('click', function () {
    function selectText() {
      message.focus();
      message.select();
      status.textContent = 'Texten är markerad. Kopiera den och klistra in den i ett mejl till info@gojorestaurang.se.';
    }
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(message.value).then(function () {
        status.textContent = 'Förfrågan är kopierad. Klistra in den i ett mejl till info@gojorestaurang.se och skicka.';
      }).catch(selectText);
    } else selectText();
  });
  validateVisit();
  form.querySelector('button[type="submit"]').disabled = false;
})();
