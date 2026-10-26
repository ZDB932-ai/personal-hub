import getpass
import json
import os
import pwd
import re
import smtplib
import ssl
import sys
import tempfile
from pathlib import Path


def main():
    if os.geteuid() != 0 or not sys.stdin.isatty():
        raise RuntimeError('请以 root 在交互式 SSH 终端运行，不要通过管道输入授权码。')
    os.umask(0o077)
    address = input('发信 QQ 邮箱（完整地址）：').strip().lower()
    if not re.fullmatch(r'[a-z0-9._+-]+@(qq\.com|foxmail\.com)', address):
        raise RuntimeError('请输入普通 QQ 邮箱或 Foxmail 邮箱完整地址。')
    secret = getpass.getpass('SMTP 授权码（输入不显示，粘贴后按回车）：').strip()
    if not secret or len(secret) > 256 or any(c.isspace() for c in secret):
        raise RuntimeError('授权码为空或格式异常，请重新运行。')
    print('正在通过 TLS 验证 QQ SMTP 登录；不会发送邮件…')
    client = smtplib.SMTP_SSL('smtp.qq.com', 465, timeout=20, context=ssl.create_default_context())
    try:
        client.login(address, secret)
    finally:
        client.close()
    directory = Path('/opt/personal-hub/data')
    target = directory / 'mail.local.json'
    if target.is_symlink():
        raise RuntimeError('配置路径异常，未写入。')
    account = pwd.getpwnam('personal-hub')
    descriptor, temporary = tempfile.mkstemp(prefix='.mail-config-', dir=directory)
    try:
        with os.fdopen(descriptor, 'w', encoding='utf-8') as output:
            json.dump({'host': 'smtp.qq.com', 'port': 465, 'secure': True, 'user': address, 'password': secret, 'from': address}, output)
            output.flush()
            os.fchmod(output.fileno(), 0o600)
            os.fchown(output.fileno(), account.pw_uid, account.pw_gid)
            os.fsync(output.fileno())
        os.replace(temporary, target)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
    print('配置成功：SMTP 登录已验证，私有配置已保存（权限 600）。请回复助手“已配置”。')


try:
    main()
except (KeyboardInterrupt, EOFError):
    print('\n已取消，未更改原配置。')
    sys.exit(1)
except smtplib.SMTPAuthenticationError:
    print('QQ SMTP 登录失败，未更改原配置。请检查邮箱地址、SMTP 开关和授权码；不要使用 QQ 登录密码。')
    sys.exit(1)
except Exception as error:
    print(f'配置未完成（{type(error).__name__}）。请检查网络和输入后重试；不要把授权码发给助手。')
    sys.exit(1)
