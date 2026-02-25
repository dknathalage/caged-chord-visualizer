<script>
  let { cx, cy, r, fill, label = '', labelColor = '#fff' } = $props();
</script>

<circle {cx} {cy} {r} {fill} />
{#if label}
  <text
    x={cx}
    y={cy}
    text-anchor="middle"
    dominant-baseline="central"
    fill={labelColor}
    font-size={label.length > 1 ? r * 0.8 : r}
    font-weight="bold"
    font-family="JetBrains Mono"
  >{label}</text>
{/if}
