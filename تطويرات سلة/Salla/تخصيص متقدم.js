/* Alaslee — Salla advanced JavaScript customization v2.0 */
(function () {
  'use strict';

  var FAQ_QUESTION = '.faq-question';
  var FAQ_ANSWER = '.faq-answer';
  var faqId = 0;

  function isElement(node) {
    return node && node.nodeType === 1;
  }

  function findAll(root, selector) {
    var matches = [];

    if (isElement(root) && root.matches(selector)) {
      matches.push(root);
    }

    if (root && root.querySelectorAll) {
      root.querySelectorAll(selector).forEach(function (element) {
        matches.push(element);
      });
    }

    return matches;
  }

  function setFaqState(question, answer, expanded) {
    question.classList.toggle('active', expanded);
    answer.classList.toggle('active', expanded);
    question.setAttribute('aria-expanded', String(expanded));
    answer.hidden = !expanded;
  }

  function closeSiblingFaqs(question) {
    var scope = question.closest('.faq-section') || document;

    scope.querySelectorAll(FAQ_QUESTION + '[data-alaslee-faq-ready="true"]').forEach(function (item) {
      if (item === question) return;

      var itemAnswer = item.nextElementSibling;
      if (itemAnswer && itemAnswer.matches(FAQ_ANSWER)) {
        setFaqState(item, itemAnswer, false);
      }
    });
  }

  function toggleFaq(question, answer) {
    var willExpand = question.getAttribute('aria-expanded') !== 'true';

    if (willExpand) {
      closeSiblingFaqs(question);
    }

    setFaqState(question, answer, willExpand);
  }

  function enhanceFaqQuestion(question) {
    if (!isElement(question) || question.dataset.alasleeFaqReady === 'true') return;
    if (question.tagName === 'SUMMARY') return; // <details> يعمل دلالياً دون تدخل.

    var answer = question.nextElementSibling;
    if (!answer || !answer.matches(FAQ_ANSWER)) return;

    faqId += 1;
    question.dataset.alasleeFaqReady = 'true';

    if (!question.id) question.id = 'alaslee-faq-question-' + faqId;
    if (!answer.id) answer.id = 'alaslee-faq-answer-' + faqId;

    if (question.tagName !== 'BUTTON') {
      question.setAttribute('role', 'button');
      question.setAttribute('tabindex', '0');
    }

    question.setAttribute('aria-controls', answer.id);
    answer.setAttribute('role', 'region');
    answer.setAttribute('aria-labelledby', question.id);

    var initiallyOpen = question.classList.contains('active') ||
      question.getAttribute('aria-expanded') === 'true';
    setFaqState(question, answer, initiallyOpen);

    question.addEventListener('click', function () {
      toggleFaq(question, answer);
    });

    if (question.tagName !== 'BUTTON') {
      question.addEventListener('keydown', function (event) {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        toggleFaq(question, answer);
      });
    }
  }

  function enhanceFaqs(root) {
    if (!root) return;

    findAll(root, FAQ_QUESTION).forEach(enhanceFaqQuestion);
  }

  function setArabicLabel(element, label) {
    if (!element) return;

    var current = element.getAttribute('aria-label');
    var genericEnglishLabel = /^(Open-menu|Search|Login|Home(?:-page)?|Menu|Account|Cart|Close)$/i;

    if (!current || genericEnglishLabel.test(current)) {
      element.setAttribute('aria-label', label);
    }

    var currentTitle = element.getAttribute('title');
    if (!currentTitle || genericEnglishLabel.test(currentTitle)) {
      element.setAttribute('title', label);
    }
  }

  function makeKeyboardClickable(element) {
    if (!element || element.matches('a, button, input, select, textarea') ||
        element.dataset.alasleeKeyboardReady === 'true') return;

    element.dataset.alasleeKeyboardReady = 'true';
    element.setAttribute('role', 'button');
    element.setAttribute('tabindex', '0');
    element.addEventListener('keydown', function (event) {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      element.click();
    });
  }

  function localizeControls(root) {
    var scope = root && root.querySelectorAll ? root : document;
    var labels = [
      ['.store-header [aria-label="Open-menu"], .selia-bottom-nav-menu a', 'فتح القائمة'],
      ['.store-header [aria-label="Close"]', 'إغلاق'],
      ['.store-header [aria-label="Search"], .selia-bottom-nav-search .header-btn', 'البحث'],
      ['.store-header [aria-label="Login"], .selia-bottom-nav-user button', 'تسجيل الدخول أو الحساب'],
      ['.selia-bottom-nav-home a', 'الرئيسية'],
      ['.selia-bottom-nav-cart salla-cart-summary', 'سلة المشتريات']
    ];

    labels.forEach(function (entry) {
      findAll(scope, entry[0]).forEach(function (element) {
        setArabicLabel(element, entry[1]);
      });
    });

    findAll(scope, '.selia-bottom-nav-search .header-btn').forEach(makeKeyboardClickable);
  }

  function clearLegacyProductListStyles(root) {
    var scope = root && root.querySelectorAll ? root : document;

    findAll(scope, 'salla-products-list').forEach(function (list) {
      list.style.removeProperty('display');
      list.style.removeProperty('grid-template-columns');
      list.style.removeProperty('gap');
    });
  }

  function enhance(root) {
    enhanceFaqs(root || document);
    localizeControls(root || document);
    clearLegacyProductListStyles(root || document);
  }

  function start() {
    document.documentElement.setAttribute('data-alaslee-customization', 'v2');
    enhance(document);

    if (!document.body || typeof MutationObserver === 'undefined') return;

    var observer = new MutationObserver(function (mutations) {
      mutations.forEach(function (mutation) {
        mutation.addedNodes.forEach(function (node) {
          if (isElement(node)) enhance(node);
        });
      });
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
