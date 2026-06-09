pc.script.createLoadingScreen(function (app) {

    app.p = true;

    window.addEventListener('keydown', ev => {
    if (['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', ' '].includes(ev.key)) {
        ev.preventDefault();
    }
    });
    window.addEventListener('wheel', ev => ev.preventDefault(), { passive: false });

    if (app.p) {
        PokiSDK.init().then(
            () => {
                app.ab = false;
            }
        ).catch(
            () => {
                app.ab = true;
            }
        );

        PokiSDK.gameLoadingStart();
    }

    var showSplash = function () {
        // splash wrapper
        var wrapper = document.createElement('div');
        wrapper.id = 'application-splash-wrapper';
        document.body.appendChild(wrapper);

        // splash
        var splash = document.createElement('div');
        splash.id = 'application-splash';
        wrapper.appendChild(splash);
        splash.style.display = 'none';

        var logo = document.createElement('img');
        logo.src = 'data:image/png;base64,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';
        splash.appendChild(logo);
        logo.onload = function () {
            splash.style.display = 'block';
        };

        var container = document.createElement('div');
        container.id = 'progress-bar-container';
        splash.appendChild(container);

        var bar = document.createElement('div');
        bar.id = 'progress-bar';
        container.appendChild(bar);

    };

    var hideSplash = function () {
        var splash = document.getElementById('application-splash-wrapper');
        splash.parentElement.removeChild(splash);
    };

    var setProgress = function (value) {
        var bar = document.getElementById('progress-bar');
        if(bar) {
            value = Math.min(1, Math.max(0, value));
            bar.style.width = value * 100 + '%';
        }
    };

    var createCss = function () {
        var css = [
            'body {',
            '    background-color: #1c72c9;',
            '}',
            '',
            '#application-splash-wrapper {',
            '    position: absolute;',
            '    top: 0;',
            '    left: 0;',
            '    height: 100%;',
            '    width: 100%;',
            '    background-color: #1c72c9;',
            '}',
            '',
            '#application-splash {',
            '    position: absolute;',
            '    top: calc(50% - 28px);',
            '    width: 264px;',
            '    left: calc(50% - 132px);',
            '}',
            '',
            '#application-splash img {',
            '    width: 100%;',
            '}',
            '',
            '#progress-bar-container {',
            '    margin: 20px auto 0 auto;',
            '    height: 2px;',
            '    width: 100%;',
            '    background-color: #1d292c;',
            '}',
            '',
            '#progress-bar {',
            '    width: 0%;',
            '    height: 100%;',
            '    background-color: #fff;',
            '}',
            '',
            '@media (max-width: 480px) {',
            '    #application-splash {',
            '        width: 170px;',
            '        left: calc(50% - 85px);',
            '    }',
            '}'
        ].join('\n');

        var style = document.createElement('style');
        style.type = 'text/css';
        if (style.styleSheet) {
            style.styleSheet.cssText = css;
        } else {
            style.appendChild(document.createTextNode(css));
        }

        document.head.appendChild(style);
    };

    createCss();
    showSplash();

    app.on('preload:end', function () {
        if (app.p) {
            PokiSDK.gameLoadingFinished();
        }
        app.off('preload:progress');
    });

    app.on('preload:progress', setProgress);
    app.on('start', hideSplash);
});