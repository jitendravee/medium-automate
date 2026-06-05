# API Keys

## Required

### Anthropic API Key

Used for all AI steps in the pipeline.

1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Create an API key
3. Add to `.env`:

```
ANTHROPIC_API_KEY=sk-ant-...
```

## Optional (for future steps)

### Medium Integration Token

Required only when the Medium Publisher step is enabled.

1. Go to [medium.com/me/settings](https://medium.com/me/settings) → Integration tokens
2. Generate a token
3. Add to `.env`:

```
MEDIUM_INTEGRATION_TOKEN=your_token_here
MEDIUM_AUTHOR_ID=your_author_id_here
```

To find your Author ID, call:
```bash
curl https://api.medium.com/v1/me \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Security Notes

- Never commit `.env` to git
- `.env` is already listed in `.gitignore`
- Only share `.env.example` (no real values)
