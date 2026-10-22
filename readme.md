<div id="return-status-iframe"></div>

<script>
(function () {
  const params = new URLSearchParams(window.location.search);

  const iframeUrl = new URL(
    'https://explore-patent-purposes-lawn.trycloudflare.com/return-status/'
  );

  ['returnNumber', 'email', 'access'].forEach(function (key) {
    const value = params.get(key);

    if (value) {
      iframeUrl.searchParams.set(key, value);
    }
  });

  const iframe = document.createElement('iframe');
  iframe.src = iframeUrl.toString();
  iframe.width = '100%';
  iframe.height = '800';
  iframe.style.border = 'none';
  iframe.style.borderRadius = '8px';

  document
    .getElementById('return-status-iframe')
    .appendChild(iframe);
})();
</script>