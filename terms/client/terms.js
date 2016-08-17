Template.terms.rendered = function() {
        setBackground()
    window.onresize = function() {
        setBackground()
    }
}


var setBackground = function() {
    document.body.style.backgroundColor = '#fff';
    document.body.style.backgroundImage = 'url(/landing/landingBg.jpg)';
    document.body.style.backgroundPosition = 'center top';
    document.body.style.backgroundRepeat = 'no-repeat';
    document.body.style.backgroundSize = 'cover';
    document.body.style.backgroundAttachment = 'fixed';
}
