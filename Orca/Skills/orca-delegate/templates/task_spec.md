【{{TITLE}} · worker={{AGENT}}】
Target: {{DIR}} — 你只能在这个目录里工作。
Change: {{WHAT_TO_PRODUCE}}
Constraints: 不要修改 Ownership 以外的任何文件；不要安装任何东西；不要做额外工作。{{EXTRA_CONSTRAINTS}}
Ownership: 只拥有 {{OUTPUT_FILE}}。
Observable acceptance: {{OUTPUT_FILE}} 存在且满足：{{ACCEPTANCE}}。
完成后按 preamble 发送 worker_done（--outcome succeeded 或 failed，附 --files-modified {{OUTPUT_FILE}}）。
有必须由协调者决定的问题时，用 preamble 里的 ask 命令提问，不要自己猜。
如果任何 orca 命令报错，把完整报错追加写进 {{OUTPUT_FILE}} 末尾——这个文件是结果的最终依据。
