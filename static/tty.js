/**
 * tty.js
 * Copyright (c) 2012, Christopher Jeffrey (MIT License)
 */

;(function() {

/**
 * Elements
 */

var root = this.documentElement
  , body = this.document.body
  , doc = this.document
  , win = this;

/**
 * Terminal
 */

var socket = io.connect()
  , terms = [];

var open = doc.getElementById('open');

open.addEventListener('click', function() {
  requestTerminal();
}, false);

socket.on('connect', function() {
  requestTerminal();
});

socket.on('data', function(data, i) {
  terms[i].write(data);
});

function requestTerminal() {
  var i = terms.length;

  var term = new Term(80, 30, function(data) {
    socket.emit('data', data, i);
  });

  term.open();
  term.id = i;

  bindMouse(term, socket);

  terms.push(term);

  socket.emit('create');
}

function killTerminal(term) {
  socket.emit('kill', term.id);
  terms[term.id] = null; // don't splice!
  var wrap = term.element.parentNode;
  wrap.parentNode.removeChild(wrap);
}

/**
 * Resize & Drag
 */

function bindMouse(term) {
  var grip
    , el;

  root = doc.documentElement;
  body = doc.body;

  el = document.createElement('div');
  el.className = 'wrapper';

  grip = document.createElement('div');
  grip.className = 'grip';

  el.appendChild(grip);
  el.appendChild(term.element);
  body.appendChild(el);

  term.wrapper = el;
  term.grip = grip;

  grip.addEventListener('mousedown', function(ev) {
    swapIndex(term);

    cancel(ev);

    if (ev.ctrlKey || ev.altKey || ev.metaKey) {
      killTerminal(term);
    } else {
      resize(ev, term);
    }
  }, false);

  el.addEventListener('mousedown', function(ev) {
    swapIndex(term);

    if (ev.target !== el) return;

    cancel(ev);

    drag(ev, term);
  }, false);
}

function drag(ev, term) {
  var el = term.wrapper;

  var drag = {
    left: el.offsetLeft,
    top: el.offsetTop,
    x: ev.pageX - el.offsetLeft,
    y: ev.pageY - el.offsetTop,
    pageX: ev.pageX,
    pageY: ev.pageY
  };

  el.style.opacity = '0.60';
  el.style.cursor = 'move';
  root.style.cursor = 'move';

  var move = function(ev) {
    el.style.left =
      (drag.left + ev.pageX - drag.pageX) + 'px';
    el.style.top =
      (drag.top + ev.pageY - drag.pageY) + 'px';
  };

  var up = function(ev) {
    el.style.opacity = '';
    el.style.cursor = '';
    root.style.cursor = '';

    doc.removeEventListener('mousemove', move, false);
    doc.removeEventListener('mouseup', up, false);
  };

  doc.addEventListener('mousemove', move, false);
  doc.addEventListener('mouseup', up, false);
}

function resize(ev, term) {
  var el = term.wrapper;

  var resize = {
    x: ev.pageX,
    y: ev.pageY
  };

  el.style.overflow = 'hidden';
  el.style.opacity = '0.70';
  el.style.cursor = 'se-resize';
  root.style.cursor = 'se-resize';

  var move = function(ev) {
    var x, y;
    x = ev.pageX - el.offsetLeft;
    y = ev.pageY - el.offsetTop;
    el.style.width = x + 'px';
    el.style.height = y + 'px';
  };

  var up = function(ev) {
    var x, y;

    x = ev.pageX - resize.x + term.element.offsetWidth;
    y = ev.pageY - resize.y + term.element.offsetHeight;
    x = x / term.element.offsetWidth;
    y = y / term.element.offsetHeight;
    x = (x * term.cols) | 0;
    y = (y * term.rows) | 0;

    socket.emit('resize', x, y, term.id);
    term.resize(x, y);

    el.style.width = '';
    el.style.height = '';

    el.style.overflow = '';
    el.style.opacity = '';
    el.style.cursor = '';
    root.style.cursor = '';

    doc.removeEventListener('mousemove', move, false);
    doc.removeEventListener('mouseup', up, false);
  };

  doc.addEventListener('mousemove', move, false);
  doc.addEventListener('mouseup', up, false);
}

function swapIndex(term) {
  var el = term.wrapper;

  // focus the terminal
  term.focus();

  el.style.zIndex = '1000';

  var e = document.getElementsByTagName('div')
    , i = e.length;

  while (i--) {
    if (e[i].className === 'wrapper'
        && e[i] !== el) e[i].style.zIndex = '0';
  }
}

function cancel(ev) {
  if (ev.preventDefault) ev.preventDefault();
  ev.returnValue = false;
  if (ev.stopPropagation) ev.stopPropagation();
  ev.cancelBubble = true;
  return false;
}

/**
 * Term Resize
 */

// this should be moved into term.js
Term.prototype.resize = function(x, y) {
  var line
    , el
    , i
    , j;

  if (x < 1) x = 1;
  if (y < 1) y = 1;

  // make sure the cursor stays on screen
  if (this.y >= y) this.y = y - 1;
  if (this.x >= x) this.x = x - 1;

  if (this.cols < x) {
    i = this.lines.length;
    while (i--) {
      while (this.lines[i].length < x) {
        this.lines[i].push((this.defAttr << 16) | 32);
      }
    }
  } else if (this.cols > x) {
    i = this.lines.length;
    while (i--) {
      while (this.lines[i].length > x) {
        this.lines[i].pop();
      }
    }
  }

  j = this.rows;
  if (j < y) {
    el = this.element;
    while (j++ < y) {
      if (this.lines.length < y + this.ybase) {
        this.lines.push(this.blankLine());
      }
      if (this.children.length < y) {
        line = document.createElement('div');
        line.className = 'term';
        el.appendChild(line);
        this.children.push(line);
      }
    }
  } else if (j > y) {
    while (j-- > y) {
      if (this.lines.length > y + this.ybase) {
        this.lines.shift();
      }
      if (this.children.length > y) {
        el = this.children.pop();
        if (!el) continue;
        el.parentNode.removeChild(el);
      }
    }
  }

  this.cols = x;
  this.rows = y;
  this.scrollTop = 0;
  this.scrollBottom = y - 1;
  this.refreshStart = 0;
  this.refreshEnd = y - 1;
  this.currentHeight = this.lines.length;
  if (this.currentHeight < this.rows) {
    this.currentHeight = this.rows;
  }

  this.refresh(0, this.rows - 1);

  // it's a real nightmare trying
  // to resize the original
  // screen buffer. just set it
  // to null for now.
  this.normal = null;
};

}).call(this);
