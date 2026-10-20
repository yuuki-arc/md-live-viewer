// E2E 用の偽の生成器（rich.generator.type = "command"）。claude CLI を呼ばずに、
// stdin で受け取ったプロンプトの Title 行を埋め込んだ固定の HTML を返す
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  const title = (input.match(/^Title: (.*)$/m) || [])[1] || '';
  process.stdout.write(`Sure, here it is:
<!doctype html>
<html><head><style>:root{--mlv-bg:#123456}body{background:var(--mlv-bg)}</style></head><body>
<h1 id="fake-rich">FAKE RICH: ${title}</h1>
<div style="height: 1500px">tall</div>
</body></html>
`);
});
