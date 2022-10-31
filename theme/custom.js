// Add line numbers on code area
window.addEventListener("load", function() {
    hljs.initHighlighting();
    hljs.initLineNumbersOnLoad();
});

// Open external links in new tabs
const externalRegex = new RegExp('^(http:\\/\\/|https:\\/\\/)');
const target = document.getElementsByTagName('main')[0];
const elems = document.getElementsByTagName('a');
for(let elem of elems) {
    if(externalRegex.test(elem.getAttribute('href'))) {
        elem.setAttribute('rel', 'external noopener noreferrer');
        elem.setAttribute('target', '_blank');
    }
}

const toggle_collapse = (id) => {
    let target = document.getElementById(id);
    target.classList.toggle('collapse');
    return false;
}
